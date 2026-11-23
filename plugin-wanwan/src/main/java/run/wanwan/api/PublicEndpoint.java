package run.wanwan.api;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferLimitException;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.extension.GroupVersion;
import run.wanwan.feedback.FeedbackService;
import run.wanwan.model.Enums.MaterialType;
import run.wanwan.model.Stage;
import run.wanwan.notice.BraceArchiveService;
import run.wanwan.notice.CastJournalService;
import run.wanwan.notice.NoticeService;
import run.wanwan.search.SearchIndex;

/**
 * 匿名公开接口：/apis/api.xiaojiaoya.run/v1alpha1/**（ADR-004）。
 */
@Component
@RequiredArgsConstructor
public class PublicEndpoint implements CustomEndpoint {

    private final PublicQueryService queryService;
    private final NoticeService notices;
    private final CastJournalService journals;
    private final FeedbackService feedback;
    private final RateLimiter noticeLimiter = new RateLimiter(20, 120);
    private final RateLimiter journalLimiter = new RateLimiter(30, 180);
    private final RateLimiter archiveLimiter = new RateLimiter(30, 180);

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        return publicRoutes()
            .GET("cast-journal-config", req -> ServerResponse.ok().cacheControl(CacheControl.noStore())
                .bodyValue(journals.configuration()))
            .POST("cast-journal", this::accessJournal)
            .POST("brace-archive", this::accessBraceArchive)
            .POST("feedback", this::submitFeedback)
            .build();
    }

    RouterFunctions.Builder publicRoutes() {
        return RouterFunctions.route()
            .GET("stages", req -> ServerResponse.ok()
                .bodyValue(Arrays.stream(Stage.values()).map(Dtos.StageView::of).toList()))
            .GET("resources", this::listResources)
            .GET("resources/{name}", req -> okOrNotFound(
                queryService.getResource(req.pathVariable("name"))))
            .GET("topics", req -> ServerResponse.ok()
                .body(queryService.listTopics(intParam(req, "page", 1), intParam(req, "size", 20)),
                    Dtos.Page.class))
            .GET("topics/{name}", req -> okOrNotFound(
                queryService.getTopic(req.pathVariable("name"))))
            .GET("posts", req -> {
                String kind = req.queryParam("kind").orElse(null);
                int page = intParam(req, "page", 1);
                int size = intParam(req, "size", 20);
                return ServerResponse.ok().body(
                    kind == null ? queryService.listPosts(page, size) : queryService.listPosts(page, size, kind),
                    Dtos.Page.class);
            })
            .GET("stage-posts", this::listStagePosts)
            .GET("posts/{name}", req -> okOrNotFound(
                queryService.getPost(req.pathVariable("name"))))
            .GET("search", this::search)
            .GET("notice-config", req -> ServerResponse.ok().cacheControl(CacheControl.noStore())
                .bodyValue(notices.configuration()))
            .POST("notice-subscriptions", this::subscribeNotice);
    }

    @Override
    public GroupVersion groupVersion() {
        return GroupVersion.parseAPIVersion("api.xiaojiaoya.run/v1alpha1");
    }

    private Mono<ServerResponse> subscribeNotice(ServerRequest req) {
        if (!noticeLimiter.tryAcquire(clientIp(req))) {
            return ServerResponse.status(HttpStatus.TOO_MANY_REQUESTS).build();
        }
        return req.bodyToMono(NoticeService.NoticeRequest.class)
            .flatMap(request -> Mono.fromCallable(() -> notices.subscribe(request))
                .subscribeOn(Schedulers.boundedElastic()))
            .flatMap(result -> ServerResponse.ok().cacheControl(CacheControl.noStore()).bodyValue(result))
            .switchIfEmpty(ServerResponse.badRequest().build());
    }

    private Mono<ServerResponse> submitFeedback(ServerRequest req) {
        return req.bodyToMono(FeedbackService.Submission.class)
            .flatMap(input -> feedback.submit(
                input, WanwanCorsFilter.clientChannel(req.headers().asHttpHeaders()), clientIp(req)))
            .flatMap(receipt -> ServerResponse.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .bodyValue(receipt))
            .switchIfEmpty(ServerResponse.badRequest().build());
    }

    private Mono<ServerResponse> accessBraceArchive(ServerRequest req) {
        if (!archiveLimiter.tryAcquire(clientIp(req))) {
            return ServerResponse.status(HttpStatus.TOO_MANY_REQUESTS).build();
        }
        long contentLength = req.headers().contentLength().orElse(-1L);
        if (contentLength > BraceArchiveService.MAX_REQUEST_BYTES) {
            return ServerResponse.status(HttpStatus.PAYLOAD_TOO_LARGE).build();
        }
        return DataBufferUtils.join(req.bodyToFlux(DataBuffer.class), BraceArchiveService.MAX_REQUEST_BYTES)
            .map(buffer -> {
                try {
                    byte[] body = new byte[buffer.readableByteCount()];
                    buffer.read(body);
                    return body;
                } finally {
                    DataBufferUtils.release(buffer);
                }
            })
            .flatMap(body -> Mono.fromCallable(() -> journals.accessBraceArchive(body))
                .subscribeOn(Schedulers.boundedElastic()))
            .flatMap(result -> ServerResponse.ok().cacheControl(CacheControl.noStore()).bodyValue(result))
            .switchIfEmpty(ServerResponse.badRequest().build())
            .onErrorResume(DataBufferLimitException.class,
                error -> ServerResponse.status(HttpStatus.PAYLOAD_TOO_LARGE).build());
    }

    private Mono<ServerResponse> accessJournal(ServerRequest req) {
        if (!journalLimiter.tryAcquire(clientIp(req))) {
            return ServerResponse.status(HttpStatus.TOO_MANY_REQUESTS).build();
        }
        return req.bodyToMono(CastJournalService.Command.class)
            .flatMap(command -> Mono.fromCallable(() -> journals.access(command)).subscribeOn(Schedulers.boundedElastic()))
            .flatMap(result -> ServerResponse.ok().cacheControl(CacheControl.noStore()).bodyValue(result))
            .switchIfEmpty(ServerResponse.badRequest().build());
    }

    private static String clientIp(ServerRequest req) {
        String forwarded = req.headers().firstHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            String first = (comma >= 0 ? forwarded.substring(0, comma) : forwarded).trim();
            if (!first.isEmpty()) return first;
        }
        return req.remoteAddress()
            .map(addr -> addr.getAddress() != null ? addr.getAddress().getHostAddress() : addr.getHostString())
            .orElse("unknown");
    }

    private static final class RateLimiter {
        private static final int MAX_CLIENTS = 4096;
        private final int perClientPerMinute;
        private final int globalPerMinute;
        private long minute = Long.MIN_VALUE;
        private int total;
        private final Map<String, Integer> perClient = new HashMap<>();

        RateLimiter(int perClientPerMinute, int globalPerMinute) {
            this.perClientPerMinute = perClientPerMinute;
            this.globalPerMinute = globalPerMinute;
        }

        synchronized boolean tryAcquire(String key) {
            long now = TimeUnit.NANOSECONDS.toMinutes(System.nanoTime());
            if (minute != now) {
                minute = now;
                total = 0;
                perClient.clear();
            }
            if (total >= globalPerMinute) return false;
            int used = perClient.getOrDefault(key, 0);
            if (used >= perClientPerMinute) return false;
            if (perClient.size() < MAX_CLIENTS || perClient.containsKey(key)) {
                perClient.put(key, used + 1);
            }
            total++;
            return true;
        }
    }

    private Mono<ServerResponse> listStagePosts(ServerRequest req) {
        Stage stage = enumParam(req, "stage", Stage.class);
        if (stage == null) return ServerResponse.badRequest().build();
        String kind = req.queryParam("kind").orElse(null);
        int page = intParam(req, "page", 1);
        int size = intParam(req, "size", 20);
        return ServerResponse.ok().body(
            kind == null ? queryService.listStagePosts(stage, page, size) : queryService.listStagePosts(stage, page, size, kind),
            Dtos.Page.class);
    }

    private Mono<ServerResponse> listResources(ServerRequest req) {
        return ServerResponse.ok().body(queryService.listResources(
            enumParam(req, "stage", Stage.class),
            enumParam(req, "type", MaterialType.class),
            req.queryParam("tag").orElse(null),
            intParam(req, "page", 1),
            intParam(req, "size", 20)), Dtos.Page.class);
    }

    private Mono<ServerResponse> search(ServerRequest req) {
        String keyword = req.queryParam("keyword").orElse("");
        if (keyword.length() > SearchIndex.MAX_KEYWORD_LENGTH) {
            return ServerResponse.badRequest().bodyValue("keyword too long");
        }
        return ServerResponse.ok().body(queryService.searchWithGuides(keyword,
            enumParam(req, "stage", Stage.class),
            enumParam(req, "type", MaterialType.class),
            intParam(req, "page", 1),
            intParam(req, "size", 20)), Dtos.SearchPage.class);
    }

    private static <T> Mono<ServerResponse> okOrNotFound(Mono<T> body) {
        return body.flatMap(b -> ServerResponse.ok().bodyValue(b))
            .switchIfEmpty(ServerResponse.status(HttpStatus.NOT_FOUND).build());
    }

    static int intParam(ServerRequest req, String key, int defaultValue) {
        return req.queryParam(key).flatMap(v -> {
            try {
                return Optional.of(Integer.parseInt(v));
            } catch (NumberFormatException e) {
                return Optional.empty();
            }
        }).orElse(defaultValue);
    }

    /** 非法枚举值按"不筛选"处理，不抛 500。 */
    static <E extends Enum<E>> E enumParam(ServerRequest req, String key, Class<E> type) {
        return req.queryParam(key).flatMap(v -> {
            try {
                return Optional.of(Enum.valueOf(type, v.trim().toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException e) {
                return Optional.empty();
            }
        }).orElse(null);
    }
}
