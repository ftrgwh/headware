package com.headware.client;

import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class EditorServer {
    private static final Logger LOGGER = LoggerFactory.getLogger("headware");
    private static final String WEB = "/assets/headware/web";
    private static final String DEFAULT_MODEL = "/assets/headware/ears/plain.json";
    private static final int PORT = 8931;
    private final Path directory;
    private final EarConfig config;
    private HttpServer server;

    public EditorServer(Path directory, EarConfig config) {
        this.directory = directory;
        this.config = config;
    }

    public void start() {
        try {
            server = bind(PORT);
            server.createContext("/", this::handle);
            server.start();
        } catch (IOException failure) {
            LOGGER.error("Could not start the editor server", failure);
        }
    }

    public String url() {
        return server == null ? "" : "http://127.0.0.1:" + server.getAddress().getPort() + "/";
    }

    private static HttpServer bind(int port) throws IOException {
        InetAddress loopback = InetAddress.getLoopbackAddress();
        try {
            return HttpServer.create(new InetSocketAddress(loopback, port), 0);
        } catch (IOException busy) {
            return HttpServer.create(new InetSocketAddress(loopback, 0), 0);
        }
    }

    private void handle(HttpExchange exchange) throws IOException {
        try {
            String path = exchange.getRequestURI().getPath();
            if (path.startsWith("/api/")) {
                api(exchange, path);
            } else {
                resource(exchange, path);
            }
        } catch (RuntimeException failure) {
            send(exchange, 400, "application/json", "{\"error\":\"bad request\"}");
        } finally {
            exchange.close();
        }
    }

    private void api(HttpExchange exchange, String path) throws IOException {
        String method = exchange.getRequestMethod();
        if (path.equals("/api/model")) {
            if ("GET".equals(method)) {
                send(exchange, 200, "application/json", modelText());
                return;
            }
            if ("PUT".equals(method)) {
                String body = read(exchange);
                EarModel model = EarModel.parse(body);
                Files.createDirectories(directory);
                Files.writeString(directory.resolve("ears.json"), body, StandardCharsets.UTF_8);
                EarState.setModel(model);
                send(exchange, 200, "application/json", "{\"saved\":true}");
                return;
            }
        }
        if (path.equals("/api/config")) {
            if ("GET".equals(method)) {
                send(exchange, 200, "application/json", config.toJson().toString());
                return;
            }
            if ("PUT".equals(method)) {
                config.update(JsonParser.parseString(read(exchange)).getAsJsonObject());
                send(exchange, 200, "application/json", config.toJson().toString());
                return;
            }
        }
        send(exchange, 404, "application/json", "{\"error\":\"not found\"}");
    }

    private String modelText() throws IOException {
        Path saved = directory.resolve("ears.json");
        if (Files.isRegularFile(saved)) {
            return Files.readString(saved);
        }
        try (InputStream stream = EditorServer.class.getResourceAsStream(DEFAULT_MODEL)) {
            if (stream == null) {
                throw new IOException("Missing the default model");
            }
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private void resource(HttpExchange exchange, String path) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            send(exchange, 405, "text/plain", "Method not allowed");
            return;
        }
        String name = "/".equals(path) ? "/index.html" : path;
        if (name.contains("..") || name.contains("\\")) {
            send(exchange, 404, "text/plain", "Not found");
            return;
        }
        try (InputStream stream = EditorServer.class.getResourceAsStream(WEB + name)) {
            if (stream == null) {
                send(exchange, 404, "text/plain", "Not found");
                return;
            }
            send(exchange, 200, type(name),
                    new String(stream.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    private static String type(String name) {
        if (name.endsWith(".html")) {
            return "text/html; charset=utf-8";
        }
        if (name.endsWith(".js")) {
            return "text/javascript; charset=utf-8";
        }
        if (name.endsWith(".css")) {
            return "text/css; charset=utf-8";
        }
        return "application/octet-stream";
    }

    private static String read(HttpExchange exchange) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (InputStream input = exchange.getRequestBody()) {
            byte[] chunk = new byte[8192];
            int count;
            while ((count = input.read(chunk)) != -1) {
                if (bytes.size() + count > 2 * 1024 * 1024) {
                    throw new IllegalArgumentException("Body too large");
                }
                bytes.write(chunk, 0, count);
            }
        }
        return bytes.toString(StandardCharsets.UTF_8);
    }

    private static void send(HttpExchange exchange, int status, String type, String body)
            throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", type);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }
}
