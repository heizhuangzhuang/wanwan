package run.wanwan.notice;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
class WechatNoticeClient {
    private static final ParameterizedTypeReference<Map<String, Object>> RESPONSE =
        new ParameterizedTypeReference<>() {};
    private static final DateTimeFormatter BEIJING_TIME =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.of("Asia/Shanghai"));

    private static final DateTimeFormatter BEIJING_DATE =
        DateTimeFormatter.ISO_LOCAL_DATE.withZone(ZoneId.of("Asia/Shanghai"));

    private final RestClient http;
    private CachedToken token;

    WechatNoticeClient() {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3)).build());
        factory.setReadTimeout(Duration.ofSeconds(5));
        http = RestClient.builder().requestFactory(factory).baseUrl("https://api.weixin.qq.com").build();
    }

    String openId(NoticeSettings.Config config, String code) {
        return openId(config.appId(), config.secret(), code);
    }

    String openId(String appId, String secret, String code) {
        Map<String, Object> response;
        try {
            response = http.get()
                .uri("/sns/jscode2session?appid={app}&secret={secret}&js_code={code}&grant_type=authorization_code",
                    appId, secret, code)
                .retrieve().body(RESPONSE);
        } catch (RestClientException e) {
            // The provider URL can include credentials. Do not attach the original exception.
            throw new Unavailable();
        }
        if (response != null && response.get("openid") instanceof String openId
            && openId.matches("[A-Za-z0-9_-]{8,128}")) {
            return openId;
        }
        if (errorCode(response) == 40029 || errorCode(response) == 40163) {
            throw new InvalidCode();
        }
        throw new Unavailable();
    }

    synchronized String accessToken(NoticeSettings.Config config) {
        Instant now = Instant.now();
        if (token != null && now.isBefore(token.expiresAt())) {
            return token.value();
        }
        var response = post("/cgi-bin/stable_token", Map.of(
            "grant_type", "client_credential", "appid", config.appId(),
            "secret", config.secret(), "force_refresh", false));
        if (response == null || !(response.get("access_token") instanceof String value)
            || value.isBlank() || !(response.get("expires_in") instanceof Number ttl)) {
            throw new Unavailable();
        }
        token = new CachedToken(value, now.plusSeconds(Math.max(1, ttl.longValue() - 120)));
        return token.value();
    }

    int send(NoticeSettings.Config config, String accessToken, String openId, String title,
             String page, Instant publishedAt) {
        var format = config.timeField().startsWith("date") ? BEIJING_DATE : BEIJING_TIME;
        String date = format.format(publishedAt);
        return errorCode(post("/cgi-bin/message/subscribe/send?access_token={token}", Map.of(
            "touser", openId, "template_id", config.template(), "page", page,
            "miniprogram_state", config.state(), "lang", "zh_CN",
            "data", Map.of(config.titleField(), Map.of("value", shortTitle(title)),
                config.timeField(), Map.of("value", date))), accessToken));
    }

    static String shortTitle(String title) {
        String text = title.replaceAll("\\s+", " ").strip();
        return text.substring(0, text.offsetByCodePoints(0, Math.min(20, text.codePointCount(0, text.length()))));
    }

    private Map<String, Object> post(String uri, Map<String, Object> body, Object... uriArgs) {
        try {
            return http.post().uri(uri, uriArgs).body(body).retrieve().body(RESPONSE);
        } catch (RestClientException e) {
            throw new Unavailable();
        }
    }

    private static int errorCode(Map<String, Object> response) {
        return response != null && response.get("errcode") instanceof Number code ? code.intValue() : -1;
    }

    private record CachedToken(String value, Instant expiresAt) {}

    static final class InvalidCode extends RuntimeException {}

    static final class Unavailable extends RuntimeException {}
}
