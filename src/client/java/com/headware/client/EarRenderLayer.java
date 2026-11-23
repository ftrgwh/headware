package com.headware.client;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;

public final class EarRenderLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
    private final EarConfig config;

    public EarRenderLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent,
            EarConfig config) {
        super(parent);
        this.config = config;
    }

    @Override
    public void submit(PoseStack poseStack, SubmitNodeCollector collector, int packedLight,
            AvatarRenderState state, float yRot, float xRot) {
        if (!config.enabled() || state.isInvisible) {
            return;
        }
        double distance = config.distance();
        if (state.distanceToCameraSq > distance * distance) {
            return;
        }
        if (config.selfOnly()) {
            Minecraft minecraft = Minecraft.getInstance();
            if (minecraft.player == null || state.id != minecraft.player.getId()) {
                return;
            }
        }
        EarModel model = EarState.model();
        if (model == null) {
            return;
        }
        poseStack.pushPose();
        getParentModel().head.translateAndRotate(poseStack);
        model.submit(poseStack, collector);
        poseStack.popPose();
    }
}
