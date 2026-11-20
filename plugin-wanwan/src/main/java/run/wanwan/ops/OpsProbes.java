package run.wanwan.ops;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.JdkClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

@Component
class OpsProbes {
    private static final String API = "/apis/api.xiaojiaoya.run/v1alpha1";
    private static final Duration TIMEOUT = Duration.ofSeconds(4);

    private final WebClient client;
    private final String web;
    private final String halo;
    private final Mono<Snapshot> snapshot;

    OpsProbes(Environment env) {
        var http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(Duration.ofSeconds(2)).build();
        client = WebClient.builder().clientConnector(new JdkClientHttpConnector(http)).build();
        web = baseUrl(env.getProperty("WANWAN_OPS_WEB_BASE_URL", "http://81.71.123.100/xiaojiaoya"));
        halo = baseUrl(env.getProperty("WANWAN_OPS_HALO_BASE_URL",
            "https://xiaojiaoya-331697-11-1510985006.sh.run.tcloudbase.com"));
        snapshot = Mono.defer(() -> Mono.zip(
            probe(web, "/healthz", Expect.HEALTH),
            probe(web, "/posts", Expect.PAGE),
            probe(halo, API + "/stages", Expect.STAGES),
            probe(halo, API + "/posts?page=1&size=1", Expect.POSTS)
        ).map(results -> new Snapshot(Instant.now(), results.getT1(), results.getT2(),
            results.getT3(), results.getT4()))).cache(Duration.ofSeconds(10));
    }

    Mono<Snapshot> snapshot() {
        return snapshot;
    }

    private Mono<Probe> probe(String base, String path, Expect expect) {
        if (base == null) {
            return Mono.just(new Probe(State.NOT_CONFIGURED, null, null));
        }
        long startedAt = System.nanoTime();
        return client.get().uri(URI.create(base + path)).accept(expect.mediaType)
            .exchangeToMono(response -> check(response, expect))
            .timeout(TIMEOUT)
            .onErrorReturn(TimeoutException.class, new Result(State.TIMEOUT, null))
            .onErrorReturn(new Result(State.UNREACHABLE, null))
            .map(result -> new Probe(result.state(), result.httpStatus(),
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt)));
    }

    private Mono<Result> check(ClientResponse response, Expect expect) {
        int status = response.statusCode().value();
        if (response.statusCode().is3xxRedirection()) {
            return response.releaseBody().thenReturn(new Result(State.REDIRECT, status));
        }
        if (status != 200) {
            return response.releaseBody().thenReturn(new Result(State.HTTP_ERROR, status));
        }
        if (response.headers().contentType().filter(expect.mediaType::isCompatibleWith).isEmpty()) {
            return response.releaseBody().thenReturn(new Result(State.UNEXPECTED_RESPONSE, status));
        }
        if (expect == Expect.PAGE) {
            return response.releaseBody().thenReturn(new Result(State.OK, status));
        }
        Mono<Object> body = expect == Expect.HEALTH
            ? response.bodyToMono(String.class).cast(Object.class)
            : response.bodyToMono(Object.class);
        return body
            .map(value -> new Result(expect.matches(value) ? State.OK : State.UNEXPECTED_RESPONSE, status))
            .defaultIfEmpty(new Result(State.UNEXPECTED_RESPONSE, status))
            .onErrorReturn(new Result(State.UNEXPECTED_RESPONSE, status));
    }

    private static String baseUrl(String input) {
        try {
            String value = input.strip().replaceAll("/+$", "");
            URI uri = URI.create(value);
            if (uri.getHost() != null && uri.getUserInfo() == null
                && uri.getQuery() == null && uri.getFragment() == null
                && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))) {
                return value;
            }
        } catch (IllegalArgumentException ignored) {
            // Invalid deployment setting is visible as an unconfigured probe.
        }
        return null;
    }

    private enum Expect {
        HEALTH(MediaType.TEXT_PLAIN), PAGE(MediaType.TEXT_HTML),
        STAGES(MediaType.APPLICATION_JSON), POSTS(MediaType.APPLICATION_JSON);

        final MediaType mediaType;

        Expect(MediaType mediaType) {
            this.mediaType = mediaType;
        }

        boolean matches(Object body) {
            return switch (this) {
                case HEALTH -> body instanceof String value && "ok".equals(value.strip());
                case STAGES -> body instanceof List<?> stageList && !stageList.isEmpty()
                    && stageList.stream().allMatch(item -> item instanceof Map<?, ?> stage
                        && stage.get("key") instanceof String && stage.get("label") instanceof String);
                case POSTS -> body instanceof Map<?, ?> page && page.get("page") instanceof Number
                    && page.get("total") instanceof Number && page.get("items") instanceof List<?>;
                case PAGE -> true;
            };
        }
    }

    enum State { OK, REDIRECT, HTTP_ERROR, UNEXPECTED_RESPONSE, TIMEOUT, UNREACHABLE, NOT_CONFIGURED }

    record Probe(State state, Integer httpStatus, Long durationMs) {}
    record Snapshot(Instant checkedAt, Probe webProcess, Probe webPosts, Probe haloStages, Probe haloPosts) {}
    private record Result(State state, Integer httpStatus) {}
}
