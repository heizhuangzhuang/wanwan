package run.wanwan.api;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import run.halo.app.security.BeforeSecurityWebFilter;

/**
 * 公开接口 CORS 白名单过滤器。
 * 未配置允许来源时不返回任何跨域放行头；拒绝通配符与凭据复用。
 */
@Component
public class WanwanCorsFilter implements BeforeSecurityWebFilter {

    private static final String API_PREFIX = "/apis/api.xiaojiaoya.run/";
    private static final String LEGACY_PREFIX = "/apis/api.wanwan.run/";
    private static final String ALLOWED_METHODS = "GET, HEAD, OPTIONS";

    private final Set<String> allowedOrigins;

    public WanwanCorsFilter(
        @Value("${wanwan.cors.allowed-origins:${WANWAN_CORS_ALLOWED_ORIGINS:}}") String origins) {
        if (origins == null || origins.isBlank()) {
            this.allowedOrigins = Set.of();
        } else {
            this.allowedOrigins = Arrays.stream(origins.split(","))
                .map(String::trim)
                .map(s -> s.endsWith("/") ? s.substring(0, s.length() - 1) : s)
                .filter(s -> !s.isEmpty() && !s.equals("*"))
                .collect(Collectors.toUnmodifiableSet());
        }
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getPath().value();
        if (!path.startsWith(API_PREFIX) && !path.startsWith(LEGACY_PREFIX)) {
            return chain.filter(exchange);
        }
        String origin = request.getHeaders().getOrigin();
        if (origin == null || origin.isBlank()) {
            return chain.filter(exchange);
        }
        String normalized = origin.endsWith("/") ? origin.substring(0, origin.length() - 1) : origin;
        if (isSameOrigin(request, normalized)) {
            return chain.filter(exchange);
        }
        if (!allowedOrigins.contains(normalized)) {
            if (request.getMethod() == HttpMethod.OPTIONS) {
                exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
                return exchange.getResponse().setComplete();
            }
            return chain.filter(exchange);
        }
        HttpHeaders headers = exchange.getResponse().getHeaders();
        headers.set(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, normalized);
        headers.add(HttpHeaders.VARY, HttpHeaders.ORIGIN);
        headers.set(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, ALLOWED_METHODS);
        headers.set(HttpHeaders.ACCESS_CONTROL_MAX_AGE, "3600");
        if (request.getMethod() == HttpMethod.OPTIONS) {
            exchange.getResponse().setStatusCode(HttpStatus.NO_CONTENT);
            return exchange.getResponse().setComplete();
        }
        return chain.filter(exchange);
    }

    private static boolean isSameOrigin(ServerHttpRequest request, String normalizedOrigin) {
        var uri = request.getURI();
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null) {
            return false;
        }
        int port = uri.getPort();
        String self = port == -1 || (scheme.equalsIgnoreCase("http") && port == 80)
            || (scheme.equalsIgnoreCase("https") && port == 443)
            ? scheme.toLowerCase(Locale.ROOT) + "://" + host.toLowerCase(Locale.ROOT)
            : scheme.toLowerCase(Locale.ROOT) + "://" + host.toLowerCase(Locale.ROOT) + ":" + port;
        return self.equalsIgnoreCase(normalizedOrigin);
    }
}
