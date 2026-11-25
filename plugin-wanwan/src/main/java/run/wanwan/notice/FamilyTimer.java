package run.wanwan.notice;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

final class FamilyTimer {
    private FamilyTimer() {}

    static void apply(ObjectNode log, String action, String id, long at) {
        var active = log.path("activeStart");
        if ("start".equals(action)) {
            if (active.isIntegralNumber() || hasSession(log, id) || overlaps(log, at, Long.MAX_VALUE, null)) {
                throw conflict();
            }
            log.put("activeStart", at).put("activeId", id);
            return;
        }
        if (!active.isIntegralNumber() || !id.equals(log.path("activeId").asString())) throw conflict();
        long start = active.asLong();
        if (at <= start || overlaps(log, start, at, null)) throw conflict();
        append(log, id, start, at);
        log.putNull("activeStart").remove("activeId");
    }

    static void record(ObjectNode log, String id, long start, long end) {
        var active = log.path("activeStart");
        if (end <= start || overlaps(log, start, end, id)
            || (active.isIntegralNumber() && end > active.asLong())) throw conflict();
        remove(log, id);
        append(log, id, start, end);
    }

    static void remove(ObjectNode log, String id) {
        var sessions = (ArrayNode) log.path("sessions");
        for (int i = 0; i < sessions.size(); i++) {
            if (id.equals(sessions.get(i).path("id").asString())) {
                sessions.remove(i);
                return;
            }
        }
    }

    private static void append(ObjectNode log, String id, long start, long end) {
        if (!log.has("sessions")) log.putArray("sessions");
        ((ArrayNode) log.path("sessions")).addObject().put("id", id).put("start", start).put("end", end);
    }

    private static boolean hasSession(ObjectNode log, String id) {
        for (var item : log.path("sessions")) if (id.equals(item.path("id").asString())) return true;
        return false;
    }

    private static boolean overlaps(ObjectNode log, long start, long end, String excluded) {
        for (var item : log.path("sessions")) {
            if (!item.path("id").asString().equals(excluded)
                && start < item.path("end").asLong() && end > item.path("start").asLong()) return true;
        }
        return false;
    }

    static ResponseStatusException conflict() {
        return new ResponseStatusException(HttpStatus.CONFLICT);
    }
}
