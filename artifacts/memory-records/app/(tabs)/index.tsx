import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { MemoryRecord, useRecords } from "@/context/RecordsContext";
import { useColors } from "@/hooks/useColors";

const UNTAGGED_KEY = "__untagged__";

type ListItem =
  | { type: "header"; tag: string; count: number }
  | { type: "record"; record: MemoryRecord };

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { records, deleteRecord, updateRecord, isLoading } = useRecords();
  const [refreshing] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  const handleAddPhoto = async (record: MemoryRecord) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Required", "Allow access to your photo library to pick images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await updateRecord(record.id, { imageUri: result.assets[0].uri });
  };

  const handleNewRecord = async () => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/new-record");
  };

  const handleHelp = async () => {
    if (Platform.OS !== "web") await Haptics.selectionAsync();
    router.push("/help");
  };

  const toggleGroup = (tag: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  // Group records by primary tag, tagged groups sorted alphabetically,
  // untagged group always last.
  const groups = useMemo<[string, MemoryRecord[]][]>(() => {
    const map = new Map<string, MemoryRecord[]>();
    for (const record of records) {
      const key = record.tags?.[0] ?? UNTAGGED_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(record);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === UNTAGGED_KEY) return 1;
      if (b === UNTAGGED_KEY) return -1;
      return a.localeCompare(b);
    });
  }, [records]);

  // Flatten groups into a single array for FlatList, hiding records in
  // collapsed groups.
  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    for (const [tag, recs] of groups) {
      items.push({ type: "header", tag, count: recs.length });
      if (!collapsedGroups.has(tag)) {
        for (const record of recs) {
          items.push({ type: "record", record });
        }
      }
    }
    return items;
  }, [groups, collapsedGroups]);

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
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    helpBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
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
    // Group header
    groupHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 4,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
    },
    groupHeaderLabel: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    groupCountBadge: {
      backgroundColor: colors.primary + "18",
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    groupCountText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.greeting}>Memory Records</Text>
          <Text style={s.title}>Your Memories</Text>
        </View>
        <View style={s.headerRight}>
          <Pressable style={s.helpBtn} onPress={handleHelp} accessibilityLabel="Help & Features Guide">
            <Feather name="help-circle" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={s.addBtn} onPress={handleNewRecord} testID="add-record-btn">
            <Feather name="plus" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) =>
          item.type === "header" ? `header-${item.tag}` : item.record.id
        }
        style={s.list}
        contentContainerStyle={[
          s.listContent,
          records.length === 0 && { flex: 1 },
        ]}
        scrollEnabled={records.length > 0}
        refreshing={refreshing}
        ListHeaderComponent={
          records.length > 0 ? (
            <Text style={s.count}>
              {records.length} {records.length === 1 ? "record" : "records"}
              {" · "}{groups.length} {groups.length === 1 ? "folder" : "folders"}
            </Text>
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
        renderItem={({ item }) => {
          if (item.type === "header") {
            const isCollapsed = collapsedGroups.has(item.tag);
            const isUntagged = item.tag === UNTAGGED_KEY;
            return (
              <Pressable style={s.groupHeader} onPress={() => toggleGroup(item.tag)}>
                <Feather
                  name={isCollapsed ? "folder" : "folder-open"}
                  size={16}
                  color={isUntagged ? colors.mutedForeground : colors.primary}
                />
                <Text style={s.groupHeaderLabel}>
                  {isUntagged ? "Untagged" : `#${item.tag}`}
                </Text>
                <View style={s.groupCountBadge}>
                  <Text style={s.groupCountText}>{item.count}</Text>
                </View>
                <Feather
                  name={isCollapsed ? "chevron-right" : "chevron-down"}
                  size={16}
                  color={colors.mutedForeground}
                />
              </Pressable>
            );
          }
          const record = item.record;
          return (
            <RecordCard
              record={record}
              onPress={() => router.push({ pathname: "/record/[id]", params: { id: record.id } })}
              onDelete={() => handleDelete(record)}
              onAddPhoto={record.imageUri ? undefined : () => handleAddPhoto(record)}
            />
          );
        }}
      />
    </View>
  );
}
