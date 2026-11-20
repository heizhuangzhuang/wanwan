package run.wanwan.ops;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.extension.GroupVersion;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.ReactiveExtensionClient;

@Component
@RequiredArgsConstructor
class OpsEndpoint implements CustomEndpoint {
    private static final Duration VALID_FOR = Duration.ofHours(24);

    private final OpsProbes probes;
    private final ReactiveExtensionClient client;

    @Override
    public GroupVersion groupVersion() {
        return new GroupVersion("console.api.wanwan.run", "v1alpha1");
    }

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        return RouterFunctions.route()
            .GET("ops-overview", this::overview)
            .PUT("ops-miniprogram-checks/{channel}", this::save)
            .build();
    }

    private Mono<ServerResponse> overview(ServerRequest request) {
        return Mono.zip(probes.snapshot(), check("trial"), check("formal"))
            .flatMap(data -> ServerResponse.ok().cacheControl(CacheControl.noStore())
                .bodyValue(new Overview(data.getT1(), List.of(data.getT2(), data.getT3()))));
    }

    private Mono<CheckView> check(String channel) {
        return client.fetch(MiniProgramCheck.class, channel)
            .map(saved -> view(channel, saved, Instant.now()))
            .defaultIfEmpty(new CheckView(channel, CheckState.UNVERIFIED, null, null, null))
            .onErrorReturn(new CheckView(channel, CheckState.UNAVAILABLE, null, null, null));
    }

    private Mono<ServerResponse> save(ServerRequest request) {
        String channel = request.pathVariable("channel");
        if (!"trial".equals(channel) && !"formal".equals(channel)) {
            return ServerResponse.notFound().build();
        }
        return request.bodyToMono(CheckInput.class)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST)))
            .flatMap(input -> saveCheck(channel, input))
            .flatMap(saved -> ServerResponse.ok().cacheControl(CacheControl.noStore())
                .bodyValue(view(channel, saved, Instant.now())));
    }

    private Mono<MiniProgramCheck> saveCheck(String channel, CheckInput input) {
        if (input.version() == null || !input.version().matches("[A-Za-z0-9][A-Za-z0-9._+-]{0,31}")
            || input.outcome() == null) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Missing or invalid version or outcome"));
        }
        return client.fetch(MiniProgramCheck.class, channel)
            .flatMap(existing -> client.update(apply(existing, input)))
            .switchIfEmpty(Mono.defer(() -> {
                var created = new MiniProgramCheck();
                var metadata = new Metadata();
                metadata.setName(channel);
                created.setMetadata(metadata);
                return client.create(apply(created, input));
            }));
    }

    private static MiniProgramCheck apply(MiniProgramCheck check, CheckInput input) {
        check.setVersion(input.version());
        check.setOutcome(input.outcome());
        check.setCheckedAt(Instant.now());
        return check;
    }

    static CheckView view(String channel, MiniProgramCheck check, Instant now) {
        Instant checkedAt = check.getCheckedAt();
        if (checkedAt == null || check.getOutcome() == null || check.getVersion() == null) {
            return new CheckView(channel, CheckState.UNVERIFIED, null, null, null);
        }
        var state = checkedAt.plus(VALID_FOR).isAfter(now) ? CheckState.RECENT : CheckState.STALE;
        return new CheckView(channel, state, check.getVersion(), check.getOutcome(), checkedAt);
    }

    enum CheckState { UNVERIFIED, RECENT, STALE, UNAVAILABLE }

    record CheckInput(String version, MiniProgramCheck.Outcome outcome) {}
    record CheckView(String channel, CheckState state, String version, MiniProgramCheck.Outcome outcome,
                     Instant checkedAt) {}
    record Overview(OpsProbes.Snapshot probes, List<CheckView> miniProgramChecks) {}
}
