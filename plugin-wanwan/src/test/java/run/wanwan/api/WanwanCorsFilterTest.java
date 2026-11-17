package run.wanwan.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

class WanwanCorsFilterTest {

    private static final WebFilterChain PASS = exchange -> Mono.empty();

    @Test
    void allowsWhitelistedOriginAndHandlesPreflight() {
        var filter = new WanwanCorsFilter("https://wanwan.run, https://www.wanwan.run/");

        var exchange = MockServerWebExchange.from(
            MockServerHttpRequest.options("/apis/api.wanwan.run/v1alpha1/resources")
                .header(HttpHeaders.ORIGIN, "https://www.wanwan.run")
                .header(HttpHeaders.HOST, "api.wanwan.run")
                .build());
        filter.filter(exchange, PASS).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(exchange.getResponse().getHeaders().getAccessControlAllowOrigin())
            .isEqualTo("https://www.wanwan.run");
        assertThat(exchange.getResponse().getHeaders().getAccessControlAllowCredentials()).isFalse();
    }

    @Test
    void rejectsUnlistedOriginAndIgnoresWildcardConfig() {
        var filter = new WanwanCorsFilter("*, https://wanwan.run");

        var preflight = MockServerWebExchange.from(
            MockServerHttpRequest.options("/apis/api.wanwan.run/v1alpha1/resources")
                .header(HttpHeaders.ORIGIN, "https://evil.example")
                .header(HttpHeaders.HOST, "api.wanwan.run")
                .build());
        filter.filter(preflight, PASS).block();
        assertThat(preflight.getResponse().getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(preflight.getResponse().getHeaders().getAccessControlAllowOrigin()).isNull();

        var get = MockServerWebExchange.from(
            MockServerHttpRequest.get("/apis/api.wanwan.run/v1alpha1/resources")
                .header(HttpHeaders.ORIGIN, "https://evil.example")
                .header(HttpHeaders.HOST, "api.wanwan.run")
                .build());
        filter.filter(get, PASS).block();
        assertThat(get.getResponse().getHeaders().getAccessControlAllowOrigin()).isNull();
    }

    @Test
    void neverAddsCorsHeadersToAdminOrCoreRoutes() {
        var filter = new WanwanCorsFilter("https://wanwan.run");

        var exchange = MockServerWebExchange.from(
            MockServerHttpRequest.get("/apis/wanwan.run/v1alpha1/resourcecards")
                .header(HttpHeaders.ORIGIN, "https://wanwan.run")
                .header(HttpHeaders.HOST, "api.wanwan.run")
                .build());
        filter.filter(exchange, PASS).block();
        assertThat(exchange.getResponse().getHeaders().getAccessControlAllowOrigin()).isNull();
    }
}
