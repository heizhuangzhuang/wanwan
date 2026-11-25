package run.wanwan.notice;

import java.time.Instant;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "wanwan.run", version = "v1alpha1", kind = "CastJournal",
    plural = "castjournals", singular = "castjournal")
public class CastJournal extends AbstractExtension {
    @ToString.Exclude
    private String encryptedPayload;
    private Instant pendingDispatchAt;
    private boolean familyManaged;
}
