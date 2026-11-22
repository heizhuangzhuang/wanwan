package run.wanwan.notice;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.ExtensionOperator;
import run.halo.app.extension.Metadata;
import tools.jackson.databind.ObjectMapper;

@Component
public class CastJournalService {
    private static final String CONSENT_VERSION = "cast-v1";
    private static final Duration NOTICE_WINDOW = Duration.ofDays(90);
    private static final ZoneId BEIJING = ZoneId.of("Asia/Shanghai");
    private final ExtensionClient client;
    private final CastJournalSettings settings;
    private final WechatNoticeClient wechat;
    private final CastJournalCipher cipher;
    private final BraceArchiveService braceArchive;
    private final ObjectMapper json = new ObjectMapper();

    CastJournalService(ExtensionClient client, CastJournalSettings settings, WechatNoticeClient wechat) {
        this.client = client;
        this.settings = settings;
        this.wechat = wechat;
        cipher = settings.enabled ? new CastJournalCipher(settings.key, settings.fallbackKeys) : null;
        braceArchive = new BraceArchiveService(client, settings, wechat, cipher);
    }

    public BraceArchiveService.State accessBraceArchive(byte[] body) {
        return braceArchive.access(body);
    }

    public Configuration configuration() {
        return new Configuration(settings.enabled, CONSENT_VERSION, settings.enabled ? settings.contact : null,
            settings.reminder == null ? null : settings.reminder.template());
    }

    public View access(Command command) {
        if (!settings.enabled) throw status(HttpStatus.SERVICE_UNAVAILABLE);
        if (command.code() == null || !command.code().matches("[A-Za-z0-9_-]{8,128}")
            || command.action() == null) throw status(HttpStatus.BAD_REQUEST);
        String openId;
        try {
            openId = wechat.openId(settings.appId, settings.secret, command.code());
        } catch (WechatNoticeClient.InvalidCode e) {
            throw status(HttpStatus.UNAUTHORIZED);
        } catch (WechatNoticeClient.Unavailable e) {
            throw status(HttpStatus.BAD_GATEWAY);
        }
        String owner = cipher.name(settings.appId, openId);
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                return apply(owner, openId, command);
            } catch (OptimisticLockingFailureException e) {
                // Read the latest version before applying the same record operation.
            }
        }
        throw status(HttpStatus.CONFLICT);
    }

    private View apply(String owner, String openId, Command request) {
        var stored = client.fetch(CastJournal.class, owner).orElse(null);
        if (stored != null && ExtensionOperator.isDeleted(stored)) throw status(HttpStatus.CONFLICT);
        if ("clear".equals(request.action())) {
            if (stored != null) persist(stored, Journal.empty());
            return view(Journal.empty());
        }
        var current = stored == null ? Journal.empty() : read(stored);
        if ("read".equals(request.action())) return view(current);
        if (!CONSENT_VERSION.equals(current.consentVersion()) && !"consent".equals(request.action())) {
            throw status(HttpStatus.FORBIDDEN);
        }

        var entries = new ArrayList<>(current.entries());
        Reminder reminder = current.reminder();
        Instant consentedAt = current.consentedAt();
        switch (request.action()) {
            case "consent" -> {
                if (!CONSENT_VERSION.equals(request.consentVersion())) throw status(HttpStatus.BAD_REQUEST);
                if (consentedAt == null || !CONSENT_VERSION.equals(current.consentVersion())) consentedAt = Instant.now();
            }
            case "save" -> {
                Entry entry = validated(request.entry());
                entries.removeIf(item -> item.id().equals(entry.id()));
                if (entries.size() >= 100) throw status(HttpStatus.UNPROCESSABLE_ENTITY);
                entries.add(entry);
                if (reminder != null && reminder.entryId().equals(entry.id())
                    && !Objects.equals(reminder.visitAt(), entry.visitAt())) reminder = null;
            }
            case "delete" -> {
                String entryId = checkedId(request.entryId());
                entries.removeIf(item -> item.id().equals(entryId));
                if (reminder != null && reminder.entryId().equals(entryId)) reminder = null;
            }
            case "schedule" -> reminder = schedule(entries, request, openId, reminder);
            case "cancel" -> reminder = null;
            default -> throw status(HttpStatus.BAD_REQUEST);
        }
        entries.sort(Comparator.comparing(Entry::castDate).reversed().thenComparing(Entry::id));
        var changed = new Journal(CONSENT_VERSION, consentedAt, entries, reminder);
        if (stored == null) {
            var journal = new CastJournal();
            var metadata = new Metadata();
            metadata.setName(owner);
            journal.setMetadata(metadata);
            pack(journal, changed);
            try {
                client.create(journal);
            } catch (RuntimeException e) {
                if (client.fetch(CastJournal.class, owner).isEmpty()) throw e;
                throw new OptimisticLockingFailureException("Cast journal was concurrently created");
            }
        } else {
            persist(stored, changed);
        }
        return view(changed);
    }

    private Reminder schedule(List<Entry> entries, Command request, String openId, Reminder existing) {
        var config = settings.reminder;
        if (config == null) throw status(HttpStatus.SERVICE_UNAVAILABLE);
        if (!config.template().equals(request.templateId())) throw status(HttpStatus.BAD_REQUEST);
        String id = checkedId(request.entryId());
        var entry = entries.stream().filter(item -> item.id().equals(id)).findFirst()
            .orElseThrow(() -> status(HttpStatus.NOT_FOUND));
        Instant now = Instant.now();
        Instant visit = entry.visitAt();
        if (visit == null || !visit.isAfter(now.plusSeconds(120)) || visit.isAfter(now.plus(NOTICE_WINDOW))) {
            throw status(HttpStatus.UNPROCESSABLE_ENTITY);
        }
        if (existing != null && existing.entryId().equals(id) && existing.visitAt().equals(visit)
            && "PENDING".equals(existing.state())) return existing;
        Instant planned = visit.minus(Duration.ofDays(1));
        Instant earliest = now.plusSeconds(30);
        return new Reminder(id, visit, planned.isBefore(earliest) ? earliest : planned, "PENDING", openId,
            config.scope(), UUID.randomUUID().toString());
    }

    Duration dispatch(String name, Instant now) {
        if (!settings.enabled) return null;
        var stored = client.fetch(CastJournal.class, name).orElse(null);
        if (stored == null || ExtensionOperator.isDeleted(stored) || stored.getPendingDispatchAt() == null) return null;
        var journal = read(stored);
        var job = journal.reminder();
        if (job == null || !job.state().equals("PENDING")) return null;
        var config = settings.reminder;
        if (config == null || !config.scope().equals(job.scope()) || !job.visitAt().isAfter(now)) {
            persist(stored, journal.withReminder(job.withState("MISSED")));
            return null;
        }
        if (job.sendAt().isAfter(now)) return Duration.between(now, job.sendAt());

        String token = wechat.accessToken(config);
        persist(stored, journal.withReminder(job.withState("UNCONFIRMED")));
        String outcome;
        try {
            int result = wechat.send(config, token, job.openId(), "复诊提醒",
                "pages/cast/cast", job.visitAt());
            outcome = result == 0 ? "SENT" : "FAILED";
        } catch (WechatNoticeClient.Unavailable e) {
            return null; // The provider may have accepted the call before timing out.
        }
        var latest = client.fetch(CastJournal.class, name).orElse(null);
        if (latest != null && !ExtensionOperator.isDeleted(latest)) {
            var snapshot = read(latest);
            var current = snapshot.reminder();
            if (current != null && job.jobId().equals(current.jobId())) {
                persist(latest, snapshot.withReminder(current.withState(outcome)));
            }
        }
        return null;
    }

    private static Entry validated(Entry input) {
        if (input == null || input.castDate() == null
            || !input.castDate().matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw status(HttpStatus.BAD_REQUEST);
        try {
            LocalDate date = LocalDate.parse(input.castDate());
            LocalDate today = LocalDate.now(BEIJING);
            if (date.isBefore(today.minusYears(10)) || date.isAfter(today)) throw status(HttpStatus.BAD_REQUEST);
        } catch (DateTimeParseException e) {
            throw status(HttpStatus.BAD_REQUEST);
        }
        String care = input.care() == null ? "" : input.care().strip();
        if (care.length() > 300) throw status(HttpStatus.BAD_REQUEST);
        if (input.visitAt() != null && (input.visitAt().isBefore(Instant.now().minus(Duration.ofDays(3650)))
            || input.visitAt().isAfter(Instant.now().plus(Duration.ofDays(366))))) throw status(HttpStatus.BAD_REQUEST);
        String side = input.side();
        Integer sequence = input.sequence();
        if (side != null && !List.of("左侧", "右侧", "双侧").contains(side)) throw status(HttpStatus.BAD_REQUEST);
        if (sequence != null && (sequence < 1 || sequence > 100)) throw status(HttpStatus.BAD_REQUEST);
        return new Entry(checkedId(input.id()), input.castDate(), care, input.visitAt(), side, sequence);
    }

    private static String checkedId(String id) {
        if (id == null || !id.matches("[a-z0-9-]{8,64}")) throw status(HttpStatus.BAD_REQUEST);
        return id;
    }

    private Journal read(CastJournal journal) {
        if (journal.getEncryptedPayload() == null) return Journal.empty();
        return json.readValue(cipher.decrypt(journal.getMetadata().getName(), journal.getEncryptedPayload()),
            Journal.class);
    }

    private void persist(CastJournal record, Journal value) {
        pack(record, value);
        client.update(record);
    }

    private void pack(CastJournal record, Journal content) {
        record.setEncryptedPayload(content.consentVersion() == null ? null
            : cipher.encrypt(record.getMetadata().getName(), json.writeValueAsBytes(content)));
        var reminder = content.reminder();
        record.setPendingDispatchAt(reminder != null && reminder.state().equals("PENDING") ? reminder.sendAt() : null);
    }

    private static View view(Journal journal) {
        var reminder = journal.reminder();
        return new View(CONSENT_VERSION.equals(journal.consentVersion()), journal.entries(), reminder == null ? null
            : new ReminderView(reminder.entryId(), reminder.visitAt(), reminder.sendAt(), reminder.state()));
    }

    private static ResponseStatusException status(HttpStatus status) {
        return new ResponseStatusException(status);
    }

    public record Configuration(boolean enabled, String consentVersion, String contact, String templateId) {}
    public record Command(String code, String action, String consentVersion, String entryId,
                          String templateId, Entry entry) {
        @Override
        public String toString() {
            return "Cast journal command";
        }
    }
    public record Entry(String id, String castDate, String care,
                        @JsonFormat(shape = JsonFormat.Shape.STRING) Instant visitAt, String side, Integer sequence) {
        public Entry(String id, String castDate, String care, Instant visitAt) {
            this(id, castDate, care, visitAt, null, null);
        }
    }
    public record View(boolean consented, List<Entry> entries, ReminderView reminder) {}
    public record ReminderView(String entryId, @JsonFormat(shape = JsonFormat.Shape.STRING) Instant visitAt,
                               @JsonFormat(shape = JsonFormat.Shape.STRING) Instant sendAt, String state) {}

    record Journal(String consentVersion, Instant consentedAt, List<Entry> entries, Reminder reminder) {
        static Journal empty() {
            return new Journal(null, null, List.of(), null);
        }

        Journal withReminder(Reminder job) {
            return new Journal(consentVersion, consentedAt, entries, job);
        }
    }

    record Reminder(String entryId, Instant visitAt, Instant sendAt, String state, String openId, String scope,
                    String jobId) {
        Reminder withState(String outcome) {
            return new Reminder(entryId, visitAt, sendAt, outcome, null, scope, jobId);
        }
    }
}
