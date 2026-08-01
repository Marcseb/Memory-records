import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RecordCard } from "@/components/RecordCard";
import { EMOTIONS, getEmotion } from "@/constants/emotions";
import { MemoryRecord, useRecords } from "@/context/RecordsContext";
import { useColors } from "@/hooks/useColors";

const UNTAGGED_KEY = "__untagged__";
const SORT_KEY = "mr_sort_mode";

type SortMode = "tag" | "emotion" | "input-date" | "note-date";

const SORT_LABELS: { mode: SortMode; label: string; icon: string }[] = [
  { mode: "tag",        label: "Folder",  icon: "folder" },
  { mode: "emotion",    label: "Emotion", icon: "heart" },
  { mode: "input-date", label: "Added",   icon: "clock" },
  { mode: "note-date",  label: "Date",    icon: "calendar" },
];

type ListItem =
  | { type: "header"; label: string; count: number; emotionColor?: string }
  | {
      type: "record";
      record: MemoryRecord;
      yearRank?: number;
      yearTotal?: number;
      onMoveUp?: () => void;
      onMoveDown?: () => void;
    };

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { records, deleteRecord, updateRecord, reorderWithinYear, isLoading } = useRecords();
  const [refreshing] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("tag");

  useEffect(() => {
    AsyncStorage.getItem(SORT_KEY).then((v) => {
      if (v === "tag" || v === "emotion" || v === "input-date" || v === "note-date") {
        setSortMode(v);
      }
    });
  }, []);

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

  const handleSortMode = async (mode: SortMode) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSortMode(mode);
    await AsyncStorage.setItem(SORT_KEY, mode);
    setCollapsedGroups(new Set());
  };

  const toggleGroup = (label: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const groups = useMemo<[string, MemoryRecord[], string?][]>(() => {
    if (sortMode === "tag") {
      const map = new Map<string, MemoryRecord[]>();
      for (const record of records) {
        const key = record.tags?.[0] ?? UNTAGGED_KEY;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(record);
      }
      return [...map.entries()]
        .sort(([a], [b]) => {
          if (a === UNTAGGED_KEY) return 1;
          if (b === UNTAGGED_KEY) return -1;
          return a.localeCompare(b);
        })
        .map(([k, recs]) => [k, recs, undefined]);
    }

    if (sortMode === "emotion") {
      const map = new Map<string, MemoryRecord[]>();
      for (const record of records) {
        const key = record.emotion ?? "neutral";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(record);
      }
      return [...map.entries()]
        .sort(([a], [b]) => {
          const eA = getEmotion(a);
          const eB = getEmotion(b);
          if (a === "neutral") return 1;
          if (b === "neutral") return -1;
          return eA.label.localeCompare(eB.label);
        })
        .map(([k, recs]) => [k, recs, getEmotion(k).color]);
    }

    return [];
  }, [records, sortMode]);

  const listData = useMemo<ListItem[]>(() => {
    if (sortMode === "input-date") {
      return [...records]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((record) => ({ type: "record" as const, record }));
    }

    if (sortMode === "note-date") {
      const sorted = [...records].sort((a, b) => {
        const yA = a.contextYear ?? -Infinity;
        const yB = b.contextYear ?? -Infinity;
        if (yB !== yA) return yB - yA;
        // Within the same year: ranked records first (ascending), then unranked (newest first)
        const rA = a.yearRank, rB = b.yearRank;
        if (rA !== undefined && rB !== undefined) return rA - rB;
        if (rA !== undefined) return -1;
        if (rB !== undefined) return 1;
        return b.createdAt - a.createdAt;
      });

      // Build a map of year → sorted records for positional info
      const yearGroups = new Map<number, MemoryRecord[]>();
      for (const r of sorted) {
        if (r.contextYear !== undefined) {
          if (!yearGroups.has(r.contextYear)) yearGroups.set(r.contextYear, []);
          yearGroups.get(r.contextYear)!.push(r);
        }
      }

      return sorted.map((record) => {
        if (record.contextYear === undefined) {
          return { type: "record" as const, record };
        }
        const group = yearGroups.get(record.contextYear)!;
        const idx = group.indexOf(record);
        const total = group.length;
        return {
          type: "record" as const,
          record,
          yearRank: idx + 1,
          yearTotal: total,
          onMoveUp: idx > 0
            ? () => reorderWithinYear(record.id, "up")
            : undefined,
          onMoveDown: idx < total - 1
            ? () => reorderWithinYear(record.id, "down")
            : undefined,
        };
      });
    }

    const items: ListItem[] = [];
    for (const [key, recs, color] of groups) {
      let label: string;
      if (sortMode === "tag") {
        label = key === UNTAGGED_KEY ? "Untagged" : `#${key}`;
      } else {
        label = getEmotion(key).label;
      }
      items.push({ type: "header", label, count: recs.length, emotionColor: color });
      if (!collapsedGroups.has(label)) {
        for (const record of recs) {
          items.push({ type: "record", record });
        }
      }
    }
    return items;
  }, [groups, collapsedGroups, sortMode, records]);

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
    sortBar: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    sortPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginRight: 8,
    },
    sortPillActive: {
      backgroundColor: colors.primary + "18",
      borderColor: colors.primary,
    },
    sortPillText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    sortPillTextActive: {
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
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

  const isGrouped = sortMode === "tag" || sortMode === "emotion";

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

      {/* Sort bar */}
      <View style={s.sortBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {SORT_LABELS.map(({ mode, label, icon }) => {
            const active = sortMode === mode;
            return (
              <Pressable
                key={mode}
                style={[s.sortPill, active && s.sortPillActive]}
                onPress={() => handleSortMode(mode)}
              >
                <Feather
                  name={icon as any}
                  size={13}
                  color={active ? colors.primary : colors.mutedForeground}
                />
                <Text style={[s.sortPillText, active && s.sortPillTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) =>
          item.type === "header" ? `header-${item.label}` : item.record.id
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
              {isGrouped && groups.length > 0
                ? `  ·  ${groups.length} ${groups.length === 1 ? "group" : "groups"}`
                : null}
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
            const isCollapsed = collapsedGroups.has(item.label);
            const isEmotion = sortMode === "emotion";
            const dotColor = item.emotionColor;
            return (
              <Pressable style={s.groupHeader} onPress={() => toggleGroup(item.label)}>
                {isEmotion && dotColor ? (
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: dotColor }} />
                ) : (
                  <Feather
                    name={isCollapsed ? "folder" : "folder-open" as any}
                    size={16}
                    color={item.label === "Untagged" ? colors.mutedForeground : colors.primary}
                  />
                )}
                <Text style={[s.groupHeaderLabel, isEmotion && dotColor ? { color: dotColor } : null]}>
                  {item.label}
                </Text>
                <View style={[s.groupCountBadge, isEmotion && dotColor ? { backgroundColor: dotColor + "20" } : null]}>
                  <Text style={[s.groupCountText, isEmotion && dotColor ? { color: dotColor } : null]}>
                    {item.count}
                  </Text>
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
              onAddPhoto={() => handleAddPhoto(record)}
              yearRank={item.yearRank}
              yearTotal={item.yearTotal}
              onMoveUp={item.onMoveUp}
              onMoveDown={item.onMoveDown}
            />
          );
        }}
      />
    </View>
  );
}
