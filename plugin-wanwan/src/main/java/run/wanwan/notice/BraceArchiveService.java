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
    private final java.util.function.Consumer<String> verifyLegacy;
    private final ObjectMapper json = new ObjectMapper();

    BraceArchiveService(ExtensionClient client, CastJournalSettings settings, WechatNoticeClient wechat,
                        CastJournalCipher cipher, java.util.function.Consumer<String> verifyLegacy) {
        this.client = client;
        this.settings = settings;
        this.wechat = wechat;
        this.cipher = cipher;
        this.verifyLegacy = verifyLegacy;
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
        verifyLegacy.accept(openId);
        String owner = owner(openId);
        return apply(owner, command);
    }

    private State apply(String owner, Command command) {
        var record = client.fetch(CastJournal.class, owner).orElse(null);
        if (record != null && ExtensionOperator.isDeleted(record)) throw status(HttpStatus.CONFLICT);
        var current = record == null || record.getEncryptedPayload() == null
            ? new State(null, CONSENT_VERSION, false, null, null)
            : readState(owner, record.getEncryptedPayload());
        if ("read".equals(command.action())) return current;
        if (record != null && record.isFamilyManaged()) throw status(HttpStatus.CONFLICT);
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
        persist(record, owner, next, false);
        return next;
    }

    private String owner(String openId) {
        return CastJournalCipher.existingName(client, settings, cipher, "brace-archive:" + settings.appId, openId);
    }

    State family(String openId, FamilyCommand command) {
        String owner = owner(openId);
        var record = client.fetch(CastJournal.class, owner).orElse(null);
        if (record != null && ExtensionOperator.isDeleted(record)) throw status(HttpStatus.CONFLICT);
        var current = record == null || record.getEncryptedPayload() == null
            ? new State(null, CONSENT_VERSION, false, null, null) : readState(owner, record.getEncryptedPayload());
        if ("read".equals(command.action())) return current;
        if (command.action() == null || command.operationId() == null
            || !command.operationId().matches("[A-Za-z0-9_-]{8,120}")) throw status(HttpStatus.BAD_REQUEST);
        String fingerprint = fingerprint(command);
        if (command.operationId().equals(current.operationId())) {
            if (!fingerprint.equals(current.operationHash())) throw status(HttpStatus.CONFLICT);
            return current;
        }
        if (!Objects.equals(current.revision(), command.revision())) throw status(HttpStatus.CONFLICT);
        String revision = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        State next;
        switch (command.action()) {
            case "consent" -> {
                if (!CONSENT_VERSION.equals(command.consentVersion())) throw status(HttpStatus.BAD_REQUEST);
                next = new State(revision, CONSENT_VERSION, true, now, current.archive());
            }
            case "clear" -> next = new State(revision, CONSENT_VERSION, false, now, null);
            default -> {
                if (!current.consented()) throw status(HttpStatus.FORBIDDEN);
                String archive = updateLog(current, command);
                validateArchive(archive);
                next = new State(revision, CONSENT_VERSION, true, now, archive);
            }
        }
        next = new State(next.revision(), next.consentVersion(), next.consented(), next.updatedAt(),
            next.archive(), command.operationId(), fingerprint);
        persist(record, owner, next, true);
        return next;
    }

    private String updateLog(State current, FamilyCommand command) {
        var document = current.archive() == null
            ? json.createObjectNode().put("format", "wanwan-brace-ledger").put("version", 1)
            : (tools.jackson.databind.node.ObjectNode) json.readTree(current.archive());
        if (!document.has("log")) {
            var empty = document.putObject("log").putNull("activeStart");
            for (var field : java.util.List.of("sessions", "plans", "confirmedZero", "visits")) empty.putArray(field);
        }
        var log = (tools.jackson.databind.node.ObjectNode) document.path("log");
        if (log.path("activeStart").isIntegralNumber() && !log.has("activeId")) {
            log.put("activeId", "legacy-" + log.path("activeStart").asLong());
        }
        String id = command.timerId();
        switch (command.action()) {
            case "start", "stop", "record", "delete" -> {
                if (id == null || !id.matches("[A-Za-z0-9_-]{8,120}")) throw status(HttpStatus.BAD_REQUEST);
                if ("delete".equals(command.action())) FamilyTimer.remove(log, id);
                else {
                    long at = checkedTime(command.at());
                    if ("record".equals(command.action())) FamilyTimer.record(log, id, at, checkedTime(command.end()));
                    else FamilyTimer.apply(log, command.action(), id, at);
                }
            }
            case "import" -> mergeArchive(log, command.archive());
            default -> throw status(HttpStatus.BAD_REQUEST);
        }
        return document.toString();
    }

    private void mergeArchive(tools.jackson.databind.node.ObjectNode log, String archive) {
        validateArchive(archive);
        var source = json.readTree(archive).path("log");
        for (var item : source.path("sessions")) {
            String id = item.path("id").asString();
            if (!id.matches("[A-Za-z0-9_-]{1,120}") || !item.path("start").isIntegralNumber()
                || !item.path("end").isIntegralNumber()) throw status(HttpStatus.BAD_REQUEST);
            boolean exists = false;
            for (var old : log.path("sessions")) {
                if (id.equals(old.path("id").asString())) {
                    if (!old.equals(item)) throw FamilyTimer.conflict();
                    exists = true;
                }
            }
            if (!exists) FamilyTimer.record(log, id, checkedTime(item.path("start").asLong()),
                checkedTime(item.path("end").asLong()));
        }
        if (source.path("activeStart").isIntegralNumber()) {
            long at = checkedTime(source.path("activeStart").asLong());
            if (log.path("activeStart").isIntegralNumber()) {
                if (log.path("activeStart").asLong() != at) throw FamilyTimer.conflict();
            } else {
                FamilyTimer.apply(log, "start", "legacy-" + at, at);
            }
        }
        for (String field : java.util.List.of("plans", "confirmedZero", "visits", "observations", "questions")) {
            if (!source.has(field)) continue;
            if (!source.path(field).isArray()) throw status(HttpStatus.BAD_REQUEST);
            if (!log.has(field) || log.path(field).isEmpty()) {
                log.set(field, source.path(field).deepCopy());
            } else if (!log.path(field).equals(source.path(field)) && !source.path(field).isEmpty()) {
                throw FamilyTimer.conflict();
            }
        }
    }

    private static long checkedTime(Long time) {
        if (time == null || time <= 0 || time > Instant.now().plusSeconds(120).toEpochMilli()) {
            throw status(HttpStatus.UNPROCESSABLE_ENTITY);
        }
        return time;
    }

    private String fingerprint(FamilyCommand command) {
        try {
            var sha = java.security.MessageDigest.getInstance("SHA-256");
            return java.util.HexFormat.of().formatHex(sha.digest(json.writeValueAsBytes(command)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private void persist(CastJournal record, String owner, State next, boolean family) {
        boolean creating = record == null;
        if (creating) {
            record = new CastJournal();
            var metadata = new Metadata();
            metadata.setName(owner);
            record.setMetadata(metadata);
        }
        if (family) record.setFamilyManaged(true);
        record.setEncryptedPayload(cipher.encryptCompressed(owner, json.writeValueAsBytes(next)));
        try {
            if (creating) client.create(record);
            else client.update(record);
        } catch (OptimisticLockingFailureException e) {
            throw status(HttpStatus.CONFLICT);
        } catch (RuntimeException e) {
            if (creating && client.fetch(CastJournal.class, owner).isPresent()) throw status(HttpStatus.CONFLICT);
            throw e;
        }
    }

    private State readState(String owner, String encryptedPayload) {
        try {
            return json.readValue(cipher.decrypt(owner, encryptedPayload), State.class);
        } catch (JacksonException | IllegalStateException e) {
            throw status(HttpStatus.INTERNAL_SERVER_ERROR);
        }
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
    record FamilyCommand(String action, String revision, String operationId, String consentVersion,
                         String timerId, Long at, Long end, String archive) {}
    public record State(String revision, String consentVersion, boolean consented, String updatedAt, String archive,
                        String operationId, String operationHash) {
        State(String revision, String consentVersion, boolean consented, String updatedAt, String archive) {
            this(revision, consentVersion, consented, updatedAt, archive, null, null);
        }

        @Override public String toString() { return "Brace archive state"; }
    }
}
