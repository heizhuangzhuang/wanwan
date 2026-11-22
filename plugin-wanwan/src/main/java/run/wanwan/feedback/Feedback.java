package run.wanwan.feedback;

import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "wanwan.run", version = "v1alpha1", kind = "Feedback",
    plural = "feedbackentries", singular = "feedback")
public class Feedback extends AbstractExtension {
    public enum Category { FEATURE, USABILITY, ISSUE, OTHER }

    public enum Status { NEW, REVIEWED, PLANNED, DONE }

    private Category category;
    private String message;
    private String channel;
    private Status status;
}
