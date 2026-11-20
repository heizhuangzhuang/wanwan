package run.wanwan.ops;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class OpsProbesTest {
    private static final String API = "/apis/api.xiaojiaoya.run/v1alpha1";
    private HttpServer server;
    private String origin;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.start();
        origin = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void distinguishesHealthyWebProcessFromFailedPageAndDoesNotFollowHaloRedirect() {
        respond("/wanwan/healthz", 200, "text/plain", "ok");
        respond("/wanwan/posts", 503, "text/html", "<h1>服务暂时不可用</h1>");
        respond(API + "/posts", 200, "application/json", "{\"page\":1,\"total\":0,\"items\":[]}");
        var loginRequests = new AtomicInteger();
        server.createContext("/login", exchange -> {
            loginRequests.incrementAndGet();
            exchange.close();
        });
        server.createContext(API + "/stages", exchange -> {
            exchange.getResponseHeaders().set("Location", origin + "/login");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });

        var snapshot = probes().snapshot().block(Duration.ofSeconds(6));
        assertThat(snapshot.webProcess().state()).isEqualTo(OpsProbes.State.OK);
        assertThat(snapshot.webPosts().state()).isEqualTo(OpsProbes.State.HTTP_ERROR);
        assertThat(snapshot.webPosts().httpStatus()).isEqualTo(503);
        assertThat(snapshot.haloStages().state()).isEqualTo(OpsProbes.State.REDIRECT);
        assertThat(snapshot.haloStages().httpStatus()).isEqualTo(302);
        assertThat(snapshot.haloPosts().state()).isEqualTo(OpsProbes.State.OK);
        assertThat(loginRequests.get()).isZero();
    }

    @Test
    void rejectsLoginHtmlAndWrongJsonEvenWithStatus200() {
        respond("/wanwan/healthz", 200, "text/plain", "unexpected");
        respond("/wanwan/posts", 200, "text/html", "<h1>原创导读</h1>");
        respond(API + "/stages", 200, "text/html", "<h1>登录</h1>");
        respond(API + "/posts", 200, "application/json", "{\"error\":\"登录\"}");

        var snapshot = probes().snapshot().block(Duration.ofSeconds(6));
        assertThat(snapshot.webProcess().state()).isEqualTo(OpsProbes.State.UNEXPECTED_RESPONSE);
        assertThat(snapshot.webPosts().state()).isEqualTo(OpsProbes.State.OK);
        assertThat(snapshot.haloStages().state()).isEqualTo(OpsProbes.State.UNEXPECTED_RESPONSE);
        assertThat(snapshot.haloPosts().state()).isEqualTo(OpsProbes.State.UNEXPECTED_RESPONSE);
    }

    @Test
    void cachesRepeatedChecksAndHandlesInvalidConfiguration() {
        respond(API + "/stages", 200, "application/json", "[{\"key\":\"BIRTH\",\"label\":\"出生后\"}]");
        respond(API + "/posts", 200, "application/json", "{\"page\":1,\"total\":0,\"items\":[]}");
        var service = new OpsProbes(new MockEnvironment()
            .withProperty("WANWAN_OPS_WEB_BASE_URL", origin + "/wanwan?unexpected=value")
            .withProperty("WANWAN_OPS_HALO_BASE_URL", origin));

        var first = service.snapshot().block(Duration.ofSeconds(6));
        var second = service.snapshot().block(Duration.ofSeconds(6));
        assertThat(first.webPosts().state()).isEqualTo(OpsProbes.State.NOT_CONFIGURED);
        assertThat(first.haloStages().state()).isEqualTo(OpsProbes.State.OK);
        assertThat(second).isSameAs(first);
    }

    private OpsProbes probes() {
        return new OpsProbes(new MockEnvironment()
            .withProperty("WANWAN_OPS_WEB_BASE_URL", origin + "/wanwan/")
            .withProperty("WANWAN_OPS_HALO_BASE_URL", origin));
    }

    private void respond(String path, int status, String contentType, String content) {
        server.createContext(path, exchange -> {
            byte[] contentBytes = content.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", contentType + "; charset=UTF-8");
            exchange.sendResponseHeaders(status, contentBytes.length);
            try (var body = exchange.getResponseBody()) {
                body.write(contentBytes);
            }
        });
    }
}
