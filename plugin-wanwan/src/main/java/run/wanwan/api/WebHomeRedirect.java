package run.wanwan.api;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import run.halo.app.security.BeforeSecurityWebFilter;

/** Sends visits to the backend root to the separate public website. */
@Component
public class WebHomeRedirect implements BeforeSecurityWebFilter {
    private static final String DEFAULT_SITE = "http://81.71.123.100/xiaojiaoya/";

    private final URI website;

    public WebHomeRedirect(@Value("${WANWAN_WEB_HOME_URL:" + DEFAULT_SITE + "}") String configuredSite) {
        website = publicWebsite(configuredSite);
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        var request = exchange.getRequest();
        var path = request.getPath().pathWithinApplication().value();
        var method = request.getMethod();
        if (website == null || !"/".equals(path) || (method != HttpMethod.GET && method != HttpMethod.HEAD)
            || wouldLoop(request.getURI(), website)) {
            return chain.filter(exchange);
        }

        var response = exchange.getResponse();
        response.setStatusCode(HttpStatus.FOUND);
        response.getHeaders().setLocation(website);
        response.getHeaders().setCacheControl(CacheControl.noStore());
        return response.setComplete();
    }

    private static URI publicWebsite(String value) {
        try {
            var uri = URI.create(value.strip()).normalize();
            if (uri.getHost() != null && uri.getUserInfo() == null && uri.getRawQuery() == null
                && uri.getRawFragment() == null
                && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))) {
                return uri;
            }
        } catch (IllegalArgumentException ignored) {
            // An invalid website setting leaves Halo's regular routes available.
        }
        return null;
    }

    private static boolean wouldLoop(URI incoming, URI target) {
        var path = target.getPath();
        return (path.isEmpty() || "/".equals(path))
            && target.getHost().equalsIgnoreCase(incoming.getHost())
            && port(target) == port(incoming);
    }

    private static int port(URI uri) {
        if (uri.getPort() >= 0) {
            return uri.getPort();
        }
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }
}
