import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RecordCard } from "@/components/RecordCard";
import { useAuth } from "@/context/AuthContext";
import { MemoryRecord, useRecords } from "@/context/RecordsContext";
import { useColors } from "@/hooks/useColors";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { records, deleteRecord, isLoading } = useRecords();
  const [refreshing] = useState(false);

  const handleDelete = (record: MemoryRecord) => {
    Alert.alert("Delete Record", "Are you sure you want to delete this memory?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await deleteRecord(record.id);
        },
      },
    ]);
  };

  const handleNewRecord = async () => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/new-record");
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerLeft: { gap: 2 },
    greeting: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    title: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    addBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 4,
    },
    list: { flex: 1 },
    listContent: {
      paddingTop: 12,
      paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 80,
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 80,
      gap: 12,
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    emptySubtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      paddingHorizontal: 40,
    },
    count: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.greeting}>
            {user ? `Hello, ${user.username}` : "Memory Records"}
          </Text>
          <Text style={s.title}>Your Memories</Text>
        </View>
        <Pressable style={s.addBtn} onPress={handleNewRecord} testID="add-record-btn">
          <Feather name="plus" size={22} color="#fff" />
        </Pressable>
      </View>

      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        style={s.list}
        contentContainerStyle={[
          s.listContent,
          records.length === 0 && { flex: 1 },
        ]}
        scrollEnabled={records.length > 0}
        refreshing={refreshing}
        ListHeaderComponent={
          records.length > 0 ? (
            <Text style={s.count}>{records.length} {records.length === 1 ? "record" : "records"}</Text>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={s.emptyContainer}>
              <View style={s.emptyIcon}>
                <Feather name="camera" size={30} color={colors.mutedForeground} />
              </View>
              <Text style={s.emptyTitle}>No memories yet</Text>
              <Text style={s.emptySubtitle}>
                Tap the + button to add your first photo memory with a note.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <RecordCard
            record={item}
            onPress={() => router.push({ pathname: "/record/[id]", params: { id: item.id } })}
            onDelete={() => handleDelete(item)}
          />
        )}
      />
    </View>
  );
}
