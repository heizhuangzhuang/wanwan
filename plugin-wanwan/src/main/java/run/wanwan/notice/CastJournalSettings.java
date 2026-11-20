package run.wanwan.notice;

import java.time.Instant;
import java.util.Base64;
import java.util.Set;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
class CastJournalSettings {
    final boolean enabled;
    final byte[] key;
    final String appId;
    final String secret;
    final NoticeSettings.Config reminder;
    final String contact;

    CastJournalSettings(Environment env) {
        appId = env.getProperty("WANWAN_WECHAT_APP_ID", "").strip();
        secret = env.getProperty("WANWAN_WECHAT_APP_SECRET", "").strip();
        contact = env.getProperty("XIAOJIAOYA_CAST_CONTACT", "").strip();
        key = decodeKey(env.getProperty("XIAOJIAOYA_CAST_ENCRYPTION_KEY", ""));
        enabled = "true".equalsIgnoreCase(env.getProperty("XIAOJIAOYA_CAST_ENABLED", "false").strip())
            && key.length == 32 && appId.matches("wx[0-9a-f]{16}") && !secret.isBlank()
            && contact.matches("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
        String prefix = "XIAOJIAOYA_CAST_NOTICE_";
        String template = env.getProperty(prefix + "TEMPLATE_ID", "").strip();
        String publicTemplate = env.getProperty("WANWAN_WECHAT_NOTICE_TEMPLATE_ID", "").strip();
        String title = env.getProperty(prefix + "TITLE_FIELD", "").strip();
        String time = env.getProperty(prefix + "TIME_FIELD", "").strip();
        String state = env.getProperty(prefix + "STATE", "formal").strip();
        reminder = enabled && !template.equals(publicTemplate)
            && template.matches("[A-Za-z0-9_-]{8,128}") && title.matches("thing[0-9]+")
            && time.matches("(time|date)[0-9]+") && Set.of("formal", "trial", "developer").contains(state)
                ? new NoticeSettings.Config(appId, secret, template, title, time, state, Instant.EPOCH) : null;
    }

    private static byte[] decodeKey(String value) {
        try {
            return Base64.getDecoder().decode(value.strip());
        } catch (IllegalArgumentException e) {
            return new byte[0];
        }
    }
}
