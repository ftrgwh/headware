package com.headware.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.rendertype.RenderTypes;

public final class EarModel {
    private static final int[][] DIRECTIONS = {
            {1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1},
    };
    private static final int[][][] CORNERS = {
            {{1, 0, 0}, {1, 1, 0}, {1, 1, 1}, {1, 0, 1}},
            {{0, 0, 1}, {0, 1, 1}, {0, 1, 0}, {0, 0, 0}},
            {{0, 1, 0}, {0, 1, 1}, {1, 1, 1}, {1, 1, 0}},
            {{0, 0, 0}, {1, 0, 0}, {1, 0, 1}, {0, 0, 1}},
            {{1, 0, 1}, {1, 1, 1}, {0, 1, 1}, {0, 0, 1}},
            {{0, 0, 0}, {0, 1, 0}, {1, 1, 0}, {1, 0, 0}},
    };
    private static final float[] SHADE = {0.78F, 0.78F, 0.5F, 1.0F, 0.9F, 0.72F};
    private final int resolution;
    private final int[] palette;
    private final Map<Long, Integer> voxels;
    private final float unit;

    private EarModel(int resolution, int[] palette, Map<Long, Integer> voxels) {
        this.resolution = resolution;
        this.palette = palette;
        this.voxels = voxels;
        this.unit = 1.0F / resolution;
    }

    public static EarModel parse(String text) {
        JsonObject root = JsonParser.parseString(text).getAsJsonObject();
        int resolution = root.get("resolution").getAsInt();
        if (resolution < 4 || resolution > 64) {
            throw new IllegalArgumentException("Unsupported resolution");
        }
        JsonArray paletteArray = root.getAsJsonArray("palette");
        int[] palette = new int[paletteArray.size()];
        for (int index = 0; index < palette.length; index++) {
            String value = paletteArray.get(index).getAsString();
            palette[index] = Integer.parseInt(value.startsWith("#") ? value.substring(1) : value, 16);
        }
        Map<Long, Integer> voxels = new HashMap<>();
        for (JsonElement element : root.getAsJsonArray("voxels")) {
            JsonArray voxel = element.getAsJsonArray();
            int color = voxel.get(3).getAsInt();
            if (color < 0 || color >= palette.length) {
                continue;
            }
            voxels.put(pack(voxel.get(0).getAsInt(), voxel.get(1).getAsInt(),
                    voxel.get(2).getAsInt()), color);
        }
        return new EarModel(resolution, palette, voxels);
    }

    public static long pack(int x, int y, int z) {
        return (long) (x + 32768) << 32 | (long) (y + 32768) << 16 | (z + 32768);
    }

    public void submit(PoseStack poseStack, SubmitNodeCollector collector) {
        collector.submitCustomGeometry(poseStack, RenderTypes.debugQuads(), this::draw);
    }

    private void draw(PoseStack.Pose pose, VertexConsumer consumer) {
        for (Map.Entry<Long, Integer> entry : voxels.entrySet()) {
            long key = entry.getKey();
            int x = (int) (key >> 32 & 0xFFFF) - 32768;
            int y = (int) (key >> 16 & 0xFFFF) - 32768;
            int z = (int) (key & 0xFFFF) - 32768;
            int color = palette[entry.getValue()];
            for (int direction = 0; direction < DIRECTIONS.length; direction++) {
                int[] offset = DIRECTIONS[direction];
                if (voxels.containsKey(pack(x + offset[0], y + offset[1], z + offset[2]))) {
                    continue;
                }
                float red = (color >> 16 & 255) / 255.0F * SHADE[direction];
                float green = (color >> 8 & 255) / 255.0F * SHADE[direction];
                float blue = (color & 255) / 255.0F * SHADE[direction];
                for (int[] corner : CORNERS[direction]) {
                    consumer.addVertex(pose, (x + corner[0]) * unit, (y + corner[1]) * unit,
                            (z + corner[2]) * unit).setColor(red, green, blue, 1.0F);
                }
            }
        }
    }
}
