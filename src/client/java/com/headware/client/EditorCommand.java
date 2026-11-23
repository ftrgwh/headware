package com.headware.client;

import com.mojang.blaze3d.Blaze3D;
import java.net.URI;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.command.v2.ClientCommands;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;

/**
 * Registers {@code /ear} and {@code /ear open}, which open the local ear editor
 * in the system browser.
 */
final class EditorCommand {
    private static final String OPENED = "message.headware.editor.opened";
    private static final String UNAVAILABLE = "message.headware.editor.unavailable";

    private final EditorServer server;

    private EditorCommand(EditorServer server) {
        this.server = server;
    }

    static void register(EditorServer server) {
        EditorCommand command = new EditorCommand(server);
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, context) ->
                dispatcher.register(ClientCommands.literal("ear")
                        .then(ClientCommands.literal("open")
                                .executes(source -> command.open(source.getSource())))
                        .executes(source -> command.open(source.getSource()))));
    }

    private int open(FabricClientCommandSource source) {
        String url = server.url();
        if (url.isEmpty()) {
            source.sendError(Component.translatable(UNAVAILABLE));
            return 0;
        }
        URI uri = URI.create(url);
        // Feedback first: opening the browser is asynchronous and fails silently
        // inside the game, so the clickable link doubles as the fallback.
        source.sendFeedback(Component.translatable(OPENED, link(uri)));
        Blaze3D.openUri(uri);
        return 1;
    }

    private static Component link(URI uri) {
        return Component.literal(uri.toString())
                .withStyle(style -> style
                        .withClickEvent(new ClickEvent.OpenUrl(uri))
                        .withColor(ChatFormatting.AQUA)
                        .withUnderlined(true));
    }
}
