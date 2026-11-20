package run.wanwan.api;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.ServerResponse;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.extension.GroupVersion;

/** Keeps existing app versions and distributed links using the same public contract. */
@Component
@RequiredArgsConstructor
class LegacyPublicEndpoint implements CustomEndpoint {
    private final PublicEndpoint current;

    @Override
    public GroupVersion groupVersion() {
        return new GroupVersion("api.wanwan.run", "v1alpha1");
    }

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        return current.publicRoutes().build();
    }
}
