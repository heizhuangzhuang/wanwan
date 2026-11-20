package run.wanwan.notice;

import java.time.Duration;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Component;
import run.halo.app.extension.controller.Controller;
import run.halo.app.extension.controller.ControllerBuilder;
import run.halo.app.extension.controller.Reconciler;

@Component
@RequiredArgsConstructor
class CastJournalReconciler implements Reconciler<Reconciler.Request> {
    private final CastJournalService journals;

    @Override
    public Result reconcile(Request request) {
        try {
            Duration delay = journals.dispatch(request.name(), Instant.now());
            return delay == null ? Result.doNotRetry() : Result.requeue(delay);
        } catch (OptimisticLockingFailureException e) {
            return Result.requeue(Duration.ofSeconds(5));
        } catch (WechatNoticeClient.Unavailable e) {
            return Result.requeue(Duration.ofMinutes(2));
        }
    }

    @Override
    public Controller setupWith(ControllerBuilder builder) {
        return builder.extension(new CastJournal()).syncAllOnStart(true).workerCount(1).build();
    }
}
