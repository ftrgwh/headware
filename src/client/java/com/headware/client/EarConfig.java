package com.headware.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class EarConfig {
    private static final Logger LOGGER = LoggerFactory.getLogger("headware");
    private final Path path;
    private boolean enabled = true;
    private boolean selfOnly = false;
    private double distance = 64.0;

    private EarConfig(Path path) {
        this.path = path;
    }

    public static EarConfig load(Path path) {
        EarConfig config = new EarConfig(path);
        if (Files.isRegularFile(path)) {
            try {
                JsonObject root = JsonParser.parseString(Files.readString(path)).getAsJsonObject();
                if (root.has("enabled")) {
                    config.enabled = root.get("enabled").getAsBoolean();
                }
                if (root.has("selfOnly")) {
                    config.selfOnly = root.get("selfOnly").getAsBoolean();
                }
                if (root.has("distance")) {
                    config.distance = root.get("distance").getAsDouble();
                }
            } catch (RuntimeException | IOException failure) {
                LOGGER.warn("Could not read the config, using defaults", failure);
            }
        }
        config.save();
        return config;
    }

    public void update(JsonObject root) {
        if (root.has("enabled")) {
            enabled = root.get("enabled").getAsBoolean();
        }
        if (root.has("selfOnly")) {
            selfOnly = root.get("selfOnly").getAsBoolean();
        }
        if (root.has("distance")) {
            distance = Math.max(4.0, Math.min(256.0, root.get("distance").getAsDouble()));
        }
        save();
    }

    public JsonObject toJson() {
        JsonObject root = new JsonObject();
        root.addProperty("enabled", enabled);
        root.addProperty("selfOnly", selfOnly);
        root.addProperty("distance", distance);
        return root;
    }

    public void save() {
        try {
            Files.createDirectories(path.getParent());
            Files.writeString(path, toJson().toString(), StandardCharsets.UTF_8);
        } catch (IOException failure) {
            LOGGER.warn("Could not save the config", failure);
        }
    }

    public boolean enabled() {
        return enabled;
    }

    public boolean selfOnly() {
        return selfOnly;
    }

    public double distance() {
        return distance;
    }
}
