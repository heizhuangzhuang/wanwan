package run.wanwan.notice;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferLimitException;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.extension.GroupVersion;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
class FamilyEndpoint implements CustomEndpoint {
    private final FamilyAccess access;
    private final CastJournalService journal;
    private final ObjectMapper json = new ObjectMapper();
    private final Map<String, Counter> gate = new ConcurrentHashMap<>();

    FamilyEndpoint(FamilyAccess access, CastJournalService journal) {
        this.access = access;
        this.journal = journal;
    }

    @Override
    public GroupVersion groupVersion() {
        return GroupVersion.parseAPIVersion("family.xiaojiaoya.run/v1alpha1");
    }

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        return RouterFunctions.route()
            .GET("status", req -> ok(Map.of("enabled", access.enabled)))
            .POST("login", req -> body(req, true, data -> access.mini(string(data, "code"))))
            .POST("pair", req -> body(req, true, data -> access.createPair(string(data, "browserSecret"))))
            .POST("approve", req -> body(req, true, data -> {
                access.approve(string(data, "code"), checkedSession(req));
                return Map.of("confirmed", true);
            }))
            .POST("exchange", req -> body(req, false, data -> {
                var session = access.exchange(string(data, "code"), string(data, "browserSecret"),
                    data.path("cancel").asBoolean());
                return session == null ? Map.of("pending", true) : session;
            }))
            .POST("logout", req -> body(req, false, data -> {
                checkedSession(req);
                access.logout(token(req));
                return Map.of("signedOut", true);
            }))
            .POST("me", req -> body(req, false, data -> {
                var session = access.session(token(req));
                return Map.of("account", session.account(), "channel", session.channel(),
                    "expiresAt", session.expires().toString());
            }))
            .POST("cast", req -> body(req, false, data -> {
                var session = checkedSession(req);
                var command = json.treeToValue(data.path("command"), CastJournalService.Command.class);
                if (command == null) throw FamilyAccess.fail(HttpStatus.BAD_REQUEST);
                Long version = data.path("revision").isIntegralNumber() ? data.path("revision").asLong() : null;
                return journal.family(session.openId(), command, version, "mini".equals(session.channel()));
            }))
            .POST("brace", req -> body(req, false, data -> {
                var session = checkedSession(req);
                var command = json.treeToValue(data, BraceArchiveService.FamilyCommand.class);
                return journal.familyBrace(session.openId(), command);
            }))
            .build();
    }

    private Mono<ServerResponse> body(ServerRequest req, boolean slow, java.util.function.Function<JsonNode, Object> operation) {
        if (!access.enabled) return error(HttpStatus.SERVICE_UNAVAILABLE);
        if (slow && !allow(req)) return error(HttpStatus.TOO_MANY_REQUESTS);
        if (req.headers().contentType().filter(MediaType.APPLICATION_JSON::isCompatibleWith).isEmpty()) {
            return error(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        }
        return DataBufferUtils.join(req.bodyToFlux(DataBuffer.class), BraceArchiveService.MAX_REQUEST_BYTES)
            .map(buffer -> {
                try {
                    var bytes = new byte[buffer.readableByteCount()];
                    buffer.read(bytes);
                    return bytes;
                } finally {
                    DataBufferUtils.release(buffer);
                }
            })
            .flatMap(bytes -> Mono.fromCallable(() -> {
                var data = json.readTree(bytes);
                if (!data.isObject()) throw FamilyAccess.fail(HttpStatus.BAD_REQUEST);
                return operation.apply(data);
            }).subscribeOn(Schedulers.boundedElastic()))
            .flatMap(FamilyEndpoint::ok)
            .switchIfEmpty(error(HttpStatus.BAD_REQUEST))
            .onErrorResume(ResponseStatusException.class, e -> error(e.getStatusCode()))
            .onErrorResume(JacksonException.class, e -> error(HttpStatus.BAD_REQUEST))
            .onErrorResume(DataBufferLimitException.class, e -> error(HttpStatus.PAYLOAD_TOO_LARGE));
    }

    private synchronized boolean allow(ServerRequest req) {
        var now = Instant.now();
        gate.values().removeIf(row -> !row.until().isAfter(now));
        String source = req.uri().getPath() + ":" + req.remoteAddress()
            .map(address -> address.getAddress().getHostAddress()).orElse("unknown");
        if (gate.size() >= 2048 && !gate.containsKey(source)) return false;
        var row = gate.getOrDefault(source, new Counter(now.plus(Duration.ofMinutes(1)), 0));
        if (row.count() >= 30) return false;
        gate.put(source, new Counter(row.until(), row.count() + 1));
        return true;
    }

    private FamilyAccess.Session checkedSession(ServerRequest req) {
        var session = access.session(token(req));
        // A stale tab must never send a previous account's queued writes with a newer browser cookie.
        if (!session.account().equals(req.headers().firstHeader("X-Xiaojiaoya-Account"))) {
            throw FamilyAccess.fail(HttpStatus.PRECONDITION_FAILED);
        }
        return session;
    }

    private static String token(ServerRequest req) {
        // Keep this credential separate from Halo's native Bearer token filter.
        return req.headers().firstHeader("X-Xiaojiaoya-Session");
    }

    private static String string(JsonNode data, String key) {
        return data.path(key).isString() ? data.path(key).asString() : null;
    }

    private static Mono<ServerResponse> ok(Object value) {
        return ServerResponse.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.APPLICATION_JSON).bodyValue(value);
    }

    private static Mono<ServerResponse> error(org.springframework.http.HttpStatusCode status) {
        return ServerResponse.status(status).cacheControl(CacheControl.noStore()).contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("status", status.value()));
    }

    private record Counter(Instant until, int count) {}
}
