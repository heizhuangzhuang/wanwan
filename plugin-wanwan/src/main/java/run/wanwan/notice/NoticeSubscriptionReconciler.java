package run.wanwan.notice;

import static run.wanwan.notice.NoticeService.GRANT_LIFETIME;

import java.time.Duration;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.ExtensionOperator;
import run.halo.app.extension.controller.Controller;
import run.halo.app.extension.controller.ControllerBuilder;
import run.halo.app.extension.controller.Reconciler;

@Component
@RequiredArgsConstructor
class NoticeSubscriptionReconciler implements Reconciler<Reconciler.Request> {
    private final ExtensionClient client;

    @Override
    public Result reconcile(Request request) {
        var current = client.fetch(NoticeSubscription.class, request.name());
        if (current.isEmpty()) return Result.doNotRetry();
        var grant = current.get();
        if (ExtensionOperator.isDeleted(grant) || grant.getOpenId() == null || grant.getAcceptedAt() == null) {
            return Result.doNotRetry();
        }
        var remaining = Duration.between(Instant.now(), grant.getAcceptedAt().plus(GRANT_LIFETIME));
        if (remaining.isPositive()) return Result.requeue(remaining);

        grant.clearGrant();
        client.update(grant);
        return Result.doNotRetry();
    }

    @Override
    public Controller setupWith(ControllerBuilder builder) {
        return builder.extension(new NoticeSubscription()).syncAllOnStart(true).build();
    }
}
