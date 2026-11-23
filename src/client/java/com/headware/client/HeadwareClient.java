package com.headware.client;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityRenderLayerRegistrationCallback;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class HeadwareClient implements ClientModInitializer {
    private static final Logger LOGGER = LoggerFactory.getLogger("headware");
    private static EarConfig config;

    @Override
    public void onInitializeClient() {
        Path directory = FabricLoader.getInstance().getConfigDir().resolve("headware");
        config = EarConfig.load(directory.resolve("config.json"));
        EarState.setModel(loadModel(directory));
        LivingEntityRenderLayerRegistrationCallback.EVENT.register(
                (type, renderer, helper, context) -> {
                    if (renderer instanceof AvatarRenderer<?> avatar) {
                        helper.register(new EarRenderLayer(avatar, config));
                    }
                });
        EditorServer server = new EditorServer(directory, config);
        server.start();
        EditorCommand.register(server);
        LOGGER.info("Editor available at {}", server.url());
    }

    private static EarModel loadModel(Path directory) {
        Path saved = directory.resolve("ears.json");
        if (Files.isRegularFile(saved)) {
            try {
                return EarModel.parse(Files.readString(saved));
            } catch (IOException | RuntimeException failure) {
                LOGGER.warn("Could not load the saved model", failure);
            }
        }
        try (InputStream stream = HeadwareClient.class
                .getResourceAsStream("/assets/headware/ears/plain.json")) {
            if (stream == null) {
                return null;
            }
            return EarModel.parse(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException | RuntimeException failure) {
            LOGGER.warn("Could not load the default model", failure);
            return null;
        }
    }
}
