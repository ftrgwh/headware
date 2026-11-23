package com.headware.client;

public final class EarState {
    private static volatile EarModel model;

    private EarState() {
    }

    public static EarModel model() {
        return model;
    }

    public static void setModel(EarModel value) {
        model = value;
    }
}
