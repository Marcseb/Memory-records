import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  uri: string | null;
  onClose: () => void;
}

export function PhotoViewerModal({ uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={!!uri}
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={onClose}
    >
      <View style={s.container}>
        {uri ? (
          <Image source={{ uri }} style={s.image} contentFit="contain" />
        ) : null}
        <Pressable
          style={[s.closeBtn, { top: (Platform.OS === "web" ? 16 : insets.top) + 8 }]}
          onPress={onClose}
          hitSlop={12}
        >
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  image: { flex: 1 },
  closeBtn: {
    position: "absolute",
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
});
