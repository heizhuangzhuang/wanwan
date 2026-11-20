package run.wanwan.notice;

import java.time.Duration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Component;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.controller.Controller;
import run.halo.app.extension.controller.ControllerBuilder;
import run.halo.app.extension.controller.Reconciler;

@Component
@RequiredArgsConstructor
@Slf4j
class NoticePublicationReconciler implements Reconciler<Reconciler.Request> {
    private final ExtensionClient client;
    private final NoticeService notices;

    @Override
    public Result reconcile(Request request) {
        try {
            client.fetch(NoticePublication.class, request.name()).ifPresent(notices::dispatch);
            return Result.doNotRetry();
        } catch (OptimisticLockingFailureException | NoticeService.DispatchPending e) {
            return Result.requeue(Duration.ofSeconds(10));
        } catch (WechatNoticeClient.Unavailable e) {
            log.warn("WeChat notice credentials temporarily unavailable");
            return Result.requeue(Duration.ofMinutes(5));
        }
    }

    @Override
    public Controller setupWith(ControllerBuilder builder) {
        return builder.extension(new NoticePublication()).syncAllOnStart(true).workerCount(1).build();
    }
}
