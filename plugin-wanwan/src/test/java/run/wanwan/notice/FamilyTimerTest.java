package run.wanwan.notice;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

class FamilyTimerTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void anOldStopCannotEndANewerTimer() {
        var log = json.createObjectNode();
        FamilyTimer.apply(log, "start", "timer-one", 100);
        FamilyTimer.apply(log, "stop", "timer-one", 200);
        FamilyTimer.apply(log, "start", "timer-two", 300);
        assertThrows(ResponseStatusException.class,
            () -> FamilyTimer.apply(log, "stop", "timer-one", 400));
        assertEquals("timer-two", log.path("activeId").asString());
        assertEquals(1, log.path("sessions").size());
    }

    @Test
    void duplicateStartAndInvalidEndLeaveTheOriginalTimerIntact() {
        var log = json.createObjectNode();
        FamilyTimer.apply(log, "start", "timer-one", 100);
        assertThrows(ResponseStatusException.class,
            () -> FamilyTimer.apply(log, "start", "timer-two", 150));
        assertThrows(ResponseStatusException.class,
            () -> FamilyTimer.apply(log, "stop", "timer-one", 99));
        assertEquals(100, log.path("activeStart").asLong());
    }
}
