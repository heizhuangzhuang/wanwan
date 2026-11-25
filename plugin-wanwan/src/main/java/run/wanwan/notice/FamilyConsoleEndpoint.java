package run.wanwan.notice;

import java.util.Comparator;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.halo.app.core.extension.User;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.ExtensionOperator;
import run.halo.app.extension.GroupVersion;

@Component
class FamilyConsoleEndpoint implements CustomEndpoint {
    private final ExtensionClient client;

    FamilyConsoleEndpoint(ExtensionClient client) {
        this.client = client;
    }

    @Override
    public GroupVersion groupVersion() {
        return new GroupVersion("console.api.xiaojiaoya.run", "v1alpha1");
    }

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        return RouterFunctions.route().GET("family-users", request -> {
            int page = request.queryParam("page").filter(value -> value.matches("[1-9][0-9]{0,4}"))
                .map(Integer::parseInt).orElse(1);
            return Mono.fromCallable(() -> list(page)).subscribeOn(Schedulers.boundedElastic())
                .flatMap(response -> ServerResponse.ok().cacheControl(CacheControl.noStore()).bodyValue(response));
        }).build();
    }

    private FamilyUsers list(int page) {
        var rows = client.list(User.class, user -> !ExtensionOperator.isDeleted(user)
                && user.getMetadata().getAnnotations() != null && user.getSpec() != null
                && "true".equals(user.getMetadata().getAnnotations().get(FamilyAccess.FAMILY_USER)),
            Comparator.comparing(user -> user.getMetadata().getName()), page, 20);
        return new FamilyUsers(rows.getTotal(), rows.getItems().stream().map(user -> {
            var annotations = user.getMetadata().getAnnotations();
            return new FamilyUser(user.getMetadata().getName(), user.getSpec().getDisplayName(),
                Boolean.TRUE.equals(user.getSpec().getDisabled()),
                annotations.get(FamilyAccess.LOGIN_ANNOTATION + "web"),
                annotations.get(FamilyAccess.LOGIN_ANNOTATION + "mini"));
        }).toList());
    }

    record FamilyUsers(long total, List<FamilyUser> items) {}
    record FamilyUser(String username, String displayName, boolean disabled, String web, String mini) {}
}
