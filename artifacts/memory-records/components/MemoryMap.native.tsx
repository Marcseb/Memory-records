import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Callout, Marker } from "react-native-maps";

import { getEmotion } from "@/constants/emotions";
import { useColors } from "@/hooks/useColors";
import {
  getMapRecordTitle,
  type MemoryMapProps,
} from "@/components/MemoryMap.types";

export function MemoryMap({
  records,
  initialRegion,
  onOpenRecord,
}: MemoryMapProps) {
  const colors = useColors();
  const styles = StyleSheet.create({
    callout: {
      width: 232,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    calloutTitle: {
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      lineHeight: 19,
    },
    calloutDateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 7,
    },
    calloutDate: {
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 12,
    },
    calloutAction: {
      marginTop: 9,
      color: colors.primary,
      fontFamily: "Inter_500Medium",
      fontSize: 12,
    },
  });

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      mapType="standard"
      showsCompass
      showsUserLocation={false}
      zoomControlEnabled={Platform.OS === "android"}
      toolbarEnabled={false}
      loadingEnabled
      loadingIndicatorColor={colors.primary}
    >
      {records.map((record) => (
        <Marker
          key={record.id}
          coordinate={{ latitude: record.lat, longitude: record.lng }}
          pinColor={getEmotion(record.emotion).color}
          title={getMapRecordTitle(record)}
          description={record.date}
          accessibilityLabel={`${getMapRecordTitle(record)}, ${record.date}`}
        >
          <Callout onPress={() => onOpenRecord(record)}>
            <View>
              <View style={styles.callout}>
                <Text numberOfLines={2} style={styles.calloutTitle}>
                  {getMapRecordTitle(record)}
                </Text>
                <View style={styles.calloutDateRow}>
                  <Feather
                    name="calendar"
                    size={12}
                    color={colors.mutedForeground}
                  />
                  <Text style={styles.calloutDate}>{record.date}</Text>
                </View>
                <Text style={styles.calloutAction}>Open memory</Text>
              </View>
            </View>
          </Callout>
        </Marker>
      ))}
    </MapView>
  );
}
