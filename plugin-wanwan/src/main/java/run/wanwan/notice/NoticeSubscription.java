package run.wanwan.notice;

import java.time.Instant;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "wanwan.run", version = "v1alpha1", kind = "NoticeSubscription",
    plural = "noticesubscriptions", singular = "noticesubscription")
public class NoticeSubscription extends AbstractExtension {
    private String scope;
    @ToString.Exclude
    private String openId;
    private Instant acceptedAt;

    void clearGrant() {
        openId = null;
        acceptedAt = null;
    }
}
