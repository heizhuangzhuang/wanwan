package run.wanwan.notice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.server.ResponseStatusException;
import run.halo.app.extension.ExtensionClient;
import run.wanwan.notice.CastJournalService.Command;
import run.wanwan.notice.CastJournalService.Entry;

class CastJournalServiceTest {
    private static final String APP = "wx1234567890abcdef";
    private static final String TEMPLATE = "cast-template";
    private static final String A = "login-code-a", B = "login-code-b";
    private static final String USER_A = "open-id-family-a", USER_B = "open-id-family-b";
    private static final String ENTRY = "cast-entry-1";
    private final Map<String, CastJournal> rows = new HashMap<>();
    private final ExtensionClient store = mock(ExtensionClient.class);
    private final WechatNoticeClient wechat = mock(WechatNoticeClient.class);
    private CastJournalSettings settings;
    private CastJournalService service;

    @BeforeEach
    void setup() {
        var env = new MockEnvironment().withProperty("XIAOJIAOYA_CAST_ENABLED", "true")
            .withProperty("XIAOJIAOYA_CAST_CONTACT", "privacy@example.test")
            .withProperty("XIAOJIAOYA_CAST_ENCRYPTION_KEY", Base64.getEncoder().encodeToString(new byte[32]))
            .withProperty("WANWAN_WECHAT_APP_ID", APP)
            .withProperty("WANWAN_WECHAT_APP_SECRET", "dummy-for-unit-test")
            .withProperty("XIAOJIAOYA_CAST_NOTICE_TEMPLATE_ID", TEMPLATE)
            .withProperty("XIAOJIAOYA_CAST_NOTICE_TITLE_FIELD", "thing1")
            .withProperty("XIAOJIAOYA_CAST_NOTICE_TIME_FIELD", "time2");
        settings = new CastJournalSettings(env);
        service = new CastJournalService(store, settings, wechat);
        when(wechat.openId(eq(APP), anyString(), eq(A))).thenReturn(USER_A);
        when(wechat.openId(eq(APP), anyString(), eq(B))).thenReturn(USER_B);
        when(store.fetch(eq(CastJournal.class), anyString()))
            .thenAnswer(call -> Optional.ofNullable(rows.get(call.getArgument(1))));
        org.mockito.Mockito.doAnswer(call -> {
            CastJournal journal = call.getArgument(0);
            rows.put(journal.getMetadata().getName(), journal);
            return null;
        }).when(store).create(any(CastJournal.class));
    }

    @Test
    void guardianConsentAndWechatIdentityIsolateEncryptedRecords() {
        var entry = entry(Instant.now().plus(Duration.ofDays(2)));
        assertThatThrownBy(() -> service.access(new Command(A, "save", null, null, null, entry)))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        consent(A);
        var saved = service.access(new Command(A, "save", null, null, null, entry));
        assertThat(saved.entries()).containsExactly(entry);
        assertThat(service.access(command(B, "read")).entries()).isEmpty();
        assertThat(service.access(command(A, "read")).entries()).containsExactly(entry);
        var stored = rows.values().iterator().next();
        assertThat(stored.getEncryptedPayload()).doesNotContain(entry.care(), USER_A);
        assertThat(stored.getMetadata().getName()).doesNotContain(USER_A);
        assertThat(service.access(command(A, "clear")).consented()).isFalse();
        assertThat(stored.getEncryptedPayload()).isNull();
        assertThat(service.access(command(A, "read")).entries()).isEmpty();
    }

    @Test
    void reminderClaimsOnceAndSendsOnlyGenericTitleAndAppointmentTime() {
        Instant visit = Instant.now().plus(Duration.ofDays(2));
        consent(A);
        service.access(new Command(A, "save", null, null, null, entry(visit)));
        var pending = service.access(new Command(A, "schedule", null, ENTRY, TEMPLATE, null));
        assertThat(pending.reminder().sendAt()).isEqualTo(visit.minus(Duration.ofDays(1)));
        var stored = rows.values().iterator().next();
        assertThat(service.dispatch(stored.getMetadata().getName(), Instant.now())).isPositive();
        when(wechat.accessToken(settings.reminder)).thenReturn("test-token");
        when(wechat.send(settings.reminder, "test-token", USER_A, "复诊提醒", "pages/cast/cast", visit))
            .thenReturn(0);
        service.dispatch(stored.getMetadata().getName(), pending.reminder().sendAt());
        service.dispatch(stored.getMetadata().getName(), pending.reminder().sendAt().plusSeconds(1));
        verify(wechat, times(1)).send(settings.reminder, "test-token", USER_A, "复诊提醒", "pages/cast/cast", visit);
        assertThat(service.access(command(A, "read")).reminder().state()).isEqualTo("SENT");
        assertThat(stored.getPendingDispatchAt()).isNull();
    }

    @Test
    void editingNextVisitAndWithdrawingDeletePendingReminder() {
        Instant visit = Instant.now().plus(Duration.ofDays(2));
        consent(A);
        service.access(new Command(A, "save", null, null, null, entry(visit)));
        service.access(new Command(A, "schedule", null, ENTRY, TEMPLATE, null));
        var saved = service.access(new Command(A, "save", null, null, null, entry(visit.plusSeconds(60))));
        assertThat(saved.reminder()).isNull();
        service.access(new Command(A, "schedule", null, ENTRY, TEMPLATE, null));
        service.access(command(A, "clear"));
        var stored = rows.values().iterator().next();
        assertThat(stored.getPendingDispatchAt()).isNull();
        assertThat(service.dispatch(stored.getMetadata().getName(), visit)).isNull();
    }

    private void consent(String loginCode) {
        service.access(new Command(loginCode, "consent", service.configuration().consentVersion(), null, null, null));
    }

    private static Entry entry(Instant visit) {
        return new Entry(ENTRY, LocalDate.now(ZoneId.of("Asia/Shanghai")).toString(), "家长自己记录的事项", visit);
    }

    private static Command command(String loginCode, String action) {
        return new Command(loginCode, action, null, null, null, null);
    }
}
