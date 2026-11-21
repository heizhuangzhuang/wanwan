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
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "X-Wanwan-Client")
                .build());
        filter.filter(exchange, PASS).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(exchange.getResponse().getHeaders().getAccessControlAllowOrigin())
            .isEqualTo("https://www.wanwan.run");
        assertThat(exchange.getResponse().getHeaders().getAccessControlAllowCredentials()).isFalse();
        assertThat(exchange.getResponse().getHeaders().getAccessControlAllowHeaders())
            .containsExactly("X-Wanwan-Client");
        assertThat(exchange.getResponse().getHeaders().getAccessControlExposeHeaders())
            .containsExactly("X-Wanwan-Client");
    }

    @Test
    void reportsTheClientOnReadsAndWrites() {
        var read = MockServerHttpRequest.get("/apis/api.xiaojiaoya.run/v1alpha1/stages");
        var write = MockServerHttpRequest.post("/apis/api.xiaojiaoya.run/v1alpha1/cast-journal");
        assertThat(channel(read.header("X-Wanwan-Client", "web"))).isEqualTo("web");
        assertThat(channel(write.header("X-Wanwan-Client", "wechat-miniprogram")))
            .isEqualTo("wechat-miniprogram");
    }

    @Test
    void recognizesOlderWechatRequestsAndLeavesAmbiguousRequestsUnknown() {
        String route = "/apis/api.wanwan.run/v1alpha1/stages";
        assertThat(channel(MockServerHttpRequest.get(route).header("X-WX-SOURCE", "wx_client")))
            .isEqualTo("wechat-miniprogram");
        assertThat(channel(MockServerHttpRequest.get(route).header("X-WX-SOURCE", "wx_devtools")))
            .isEqualTo("wechat-miniprogram");
        assertThat(channel(MockServerHttpRequest.get(route))).isEqualTo("unknown");
        assertThat(channel(MockServerHttpRequest.get(route).header("X-Wanwan-Client", "other")))
            .isEqualTo("unknown");
        assertThat(channel(MockServerHttpRequest.get(route)
            .header("X-Wanwan-Client", "web", "wechat-miniprogram"))).isEqualTo("unknown");
    }

    private String channel(MockServerHttpRequest.BaseBuilder<?> request) {
        var exchange = MockServerWebExchange.from(request.build());
        new WanwanCorsFilter("").filter(exchange, PASS).block();
        assertThat(exchange.getResponse().getHeaders().getVary())
            .contains("X-Wanwan-Client", "X-WX-SOURCE");
        return exchange.getResponse().getHeaders().getFirst("X-Wanwan-Client");
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
        assertThat(exchange.getResponse().getHeaders().getFirst("X-Wanwan-Client")).isNull();
    }
}
