package run.wanwan.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

class WebHomeRedirectTest {
    private static final String BACKEND = "https://api.example.test";
    private static final String WEBSITE = "https://guide.example.test/xiaojiaoya/";

    @Test
    void redirectsGetAndHeadToConfiguredWebsiteWithoutForwardingQuery() {
        for (var method : new HttpMethod[]{HttpMethod.GET, HttpMethod.HEAD}) {
            var exchange = request(method, BACKEND + "/?display=1");
            new WebHomeRedirect(WEBSITE).filter(exchange, request -> {
                throw new AssertionError("The exact root should redirect");
            }).block();

            assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.FOUND);
            assertThat(exchange.getResponse().getHeaders().getLocation()).isEqualTo(URI.create(WEBSITE));
            assertThat(exchange.getResponse().getHeaders().getCacheControl()).isEqualTo("no-store");
        }
    }

    @Test
    void passesThroughApiConsoleHealthAndNonReadRequests() {
        var filter = new WebHomeRedirect(WEBSITE);
        for (var path : new String[]{"/console/", "/actuator/health/readiness",
            "/apis/api.xiaojiaoya.run/v1alpha1/stages"}) {
            assertPassesThrough(filter, request(HttpMethod.GET, BACKEND + path));
        }
        assertPassesThrough(filter, request(HttpMethod.POST, BACKEND + "/"));
    }

    @Test
    void passesThroughWhenDisabledUnsafeOrPointedAtSameRoot() {
        for (var website : new String[]{"", "javascript:alert(1)", "https://user@guide.example.test/",
            BACKEND + ":443/"}) {
            assertPassesThrough(new WebHomeRedirect(website), request(HttpMethod.GET, BACKEND + "/"));
        }
    }

    private static MockServerWebExchange request(HttpMethod method, String uri) {
        return MockServerWebExchange.from(MockServerHttpRequest.method(method, URI.create(uri)).build());
    }

    private static void assertPassesThrough(WebHomeRedirect filter, MockServerWebExchange exchange) {
        filter.filter(exchange, request -> {
            request.getResponse().setStatusCode(HttpStatus.NO_CONTENT);
            return Mono.empty();
        }).block();
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(exchange.getResponse().getHeaders().getLocation()).isNull();
    }
}
