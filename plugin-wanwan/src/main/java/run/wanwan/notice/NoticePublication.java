package run.wanwan.notice;

import java.time.Instant;
import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "wanwan.run", version = "v1alpha1", kind = "NoticePublication",
    plural = "noticepublications", singular = "noticepublication")
public class NoticePublication extends AbstractExtension {
    enum Kind { RESOURCE, GUIDE }

    private Kind contentKind;
    private String contentName;
    private String scope;
    private Instant publishedAt;
    private boolean completed;
}
