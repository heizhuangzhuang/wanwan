package run.wanwan.notice;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.ExtensionOperator;
import run.halo.app.extension.Metadata;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/** A private archive distinct from the cast journal, with its own consent and revision. */
public final class BraceArchiveService {
    public static final int MAX_REQUEST_BYTES = 4 * 1024 * 1024;
    private static final int MAX_ARCHIVE_CHARS = 2 * 1024 * 1024;
    private static final String CONSENT_VERSION = "brace-v1";
    private final ExtensionClient client;
    private final CastJournalSettings settings;
    private final WechatNoticeClient wechat;
    private final CastJournalCipher cipher;
    private final ObjectMapper json = new ObjectMapper();

    BraceArchiveService(ExtensionClient client, CastJournalSettings settings, WechatNoticeClient wechat,
                        CastJournalCipher cipher) {
        this.client = client;
        this.settings = settings;
        this.wechat = wechat;
        this.cipher = cipher;
    }

    public State access(byte[] body) {
        if (!settings.enabled) throw status(HttpStatus.SERVICE_UNAVAILABLE);
        Command command;
        try {
            command = json.readValue(body, Command.class);
        } catch (JacksonException exception) {
            throw status(HttpStatus.BAD_REQUEST);
        }
        if (command == null || command.code() == null || !command.code().matches("[A-Za-z0-9_-]{8,128}")
            || command.action() == null) throw status(HttpStatus.BAD_REQUEST);
        String openId;
        try {
            openId = wechat.openId(settings.appId, settings.secret, command.code());
        } catch (WechatNoticeClient.InvalidCode e) {
            throw status(HttpStatus.UNAUTHORIZED);
        } catch (WechatNoticeClient.Unavailable e) {
            throw status(HttpStatus.BAD_GATEWAY);
        }
        String owner = cipher.name("brace-archive:" + settings.appId, openId);
        return apply(owner, command);
    }

    private State apply(String owner, Command command) {
        var record = client.fetch(CastJournal.class, owner).orElse(null);
        if (record != null && ExtensionOperator.isDeleted(record)) throw status(HttpStatus.CONFLICT);
        var current = record == null ? new State(null, CONSENT_VERSION, false, null, null)
            : json.readValue(cipher.decrypt(owner, record.getEncryptedPayload()), State.class);
        if ("read".equals(command.action())) return current;
        if (!Objects.equals(current.revision(), command.revision())) throw status(HttpStatus.CONFLICT);
        String revision = UUID.randomUUID().toString();
        var next = switch (command.action()) {
            case "consent" -> {
                if (!CONSENT_VERSION.equals(command.consentVersion())) throw status(HttpStatus.BAD_REQUEST);
                yield current.consented() ? current : new State(revision, CONSENT_VERSION, true, null, null);
            }
            case "save" -> {
                if (!current.consented()) throw status(HttpStatus.FORBIDDEN);
                validateArchive(command.archive());
                yield new State(revision, CONSENT_VERSION, true, Instant.now().toString(), command.archive());
            }
            case "clear" -> new State(revision, CONSENT_VERSION, false, null, null);
            default -> throw status(HttpStatus.BAD_REQUEST);
        };

        if (next.equals(current)) return current;
        boolean creating = record == null;
        if (creating) {
            record = new CastJournal();
            var metadata = new Metadata();
            metadata.setName(owner);
            record.setMetadata(metadata);
        }
        record.setEncryptedPayload(cipher.encrypt(owner, json.writeValueAsBytes(next)));
        try {
            if (creating) client.create(record);
            else client.update(record);
        } catch (OptimisticLockingFailureException e) {
            throw status(HttpStatus.CONFLICT);
        } catch (RuntimeException e) {
            if (creating && client.fetch(CastJournal.class, owner).isPresent()) throw status(HttpStatus.CONFLICT);
            throw e;
        }
        return next;
    }

    private void validateArchive(String archive) {
        if (archive == null || archive.length() > MAX_ARCHIVE_CHARS) throw status(HttpStatus.PAYLOAD_TOO_LARGE);
        try {
            var document = json.readTree(archive);
            var log = document.path("log");
            if (!"wanwan-brace-ledger".equals(document.path("format").asString())
                || document.path("version").asInt() != 1 || !log.isObject()
                || !log.path("sessions").isArray() || !log.path("plans").isArray()
                || !log.path("confirmedZero").isArray() || !log.path("visits").isArray()
                || !(log.path("activeStart").isNull() || log.path("activeStart").isIntegralNumber())) {
                throw status(HttpStatus.BAD_REQUEST);
            }
        } catch (JacksonException e) {
            throw status(HttpStatus.BAD_REQUEST);
        }
    }

    private static ResponseStatusException status(HttpStatus status) {
        return new ResponseStatusException(status);
    }

    record Command(String code, String action, String revision, String consentVersion, String archive) {
        @Override public String toString() { return "Brace archive command"; }
    }
    public record State(String revision, String consentVersion, boolean consented, String updatedAt, String archive) {
        @Override public String toString() { return "Brace archive state"; }
    }
}
