package run.wanwan.notice;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Optional;
import java.util.Set;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
class NoticeSettings {
    private final Optional<Config> config;

    NoticeSettings(Environment env) {
        config = load(env);
    }

    Optional<Config> config() {
        return config;
    }

    private static Optional<Config> load(Environment env) {
        String prefix = "WANWAN_WECHAT_NOTICE_";
        String appId = env.getProperty("WANWAN_WECHAT_APP_ID", "").strip();
        String secret = env.getProperty("WANWAN_WECHAT_APP_SECRET", "").strip();
        String template = env.getProperty(prefix + "TEMPLATE_ID", "").strip();
        String title = env.getProperty(prefix + "TITLE_FIELD", "").strip();
        String time = env.getProperty(prefix + "TIME_FIELD", "").strip();
        String state = env.getProperty(prefix + "STATE", "formal").strip();
        if (!appId.matches("wx[0-9a-f]{16}") || secret.isEmpty()
            || !template.matches("[A-Za-z0-9_-]{8,128}") || !title.matches("thing[0-9]+")
            || !time.matches("(time|date)[0-9]+")
            || !Set.of("formal", "trial", "developer").contains(state)) {
            return Optional.empty();
        }
        try {
            Instant since = Instant.parse(env.getProperty(prefix + "FROM", "").strip());
            return Optional.of(new Config(appId, secret, template, title, time, state, since));
        } catch (DateTimeParseException e) {
            return Optional.empty();
        }
    }

    record Config(String appId, String secret, String template, String titleField,
                  String timeField, String state, Instant since) {
        String scope() {
            return appId + ":" + template;
        }

        @Override
        public String toString() {
            return "WeChat notice configuration";
        }
    }
}
