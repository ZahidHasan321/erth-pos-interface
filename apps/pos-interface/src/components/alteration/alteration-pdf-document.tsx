import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import templatePng from "@/assets/template.png";

import {
  defaultAlterationIssueColumns,
  defaultAlterationIssueRows,
  type AlterationIssueMatrixValues,
} from "./alteration-checkbox-matrix-config";
import { defaultTemplateFieldLayout } from "./field-layout";
import type { AlterationPrintMeta } from "./alteration-print-types";

type AlterationPdfDocumentProps = {
  measurementValues: Record<string, string>;
  reasonValues: AlterationIssueMatrixValues;
  meta: AlterationPrintMeta;
};

const templateWidth = 328;
const templateHeight = (1123 / 794) * templateWidth;
const templateZoom = 1;
const templateImageWidth = templateWidth * templateZoom;
const templateImageHeight = templateHeight * templateZoom;
const templateImageOffsetX = -((templateImageWidth - templateWidth) / 2);
const templateImageOffsetY = -((templateImageHeight - templateHeight) / 2);
const commentsLineIndexes = [0, 1, 2, 3, 4, 5];
const commentsRowCount = commentsLineIndexes.length;
const smallCornerRadius = 2;

const matrixHeaderLabels = {
  customerRequestChange: "CUSTOMER\nREQUEST\nCHANGE",
  garmentNotSameFatuora: "GARMENT\nNOT SAME\nFATOURA",
  badQuality: "BAD\nQUALITY",
} as const;

let hyphenationDisabled = false;

if (!hyphenationDisabled) {
  Font.registerHyphenationCallback((word) => [word]);
  hyphenationDisabled = true;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    padding: 10,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  sheet: {
    flex: 1,
    backgroundColor: "#ffffff",
    padding: 10,
  },
  sheetContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  mainColumn: {
    flex: 1,
    paddingRight: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  topLeft: {
    width: 96,
  },
  roundedLabel: {
    borderWidth: 1.5,
    borderColor: "#111827",
    borderRadius: smallCornerRadius,
    textAlign: "center",
    fontSize: 10,
    paddingVertical: 2,
    marginBottom: 4,
  },
  roundedInput: {
    borderWidth: 1.5,
    borderColor: "#8f97a3",
    borderRadius: smallCornerRadius,
    height: 20,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingHorizontal: 6,
  },
  roundedInputText: {
    fontSize: 9,
    textAlign: "left",
  },
  topCenter: {
    flexGrow: 1,
    alignItems: "center",
    paddingTop: 2,
  },
  topRowRightSpacer: {
    width: 34,
  },
  title: {
    fontSize: 24,
    letterSpacing: 1,
    color: "#dc2626",
  },
  topRight: {
    width: 96,
    alignItems: "flex-end",
    gap: 3,
  },
  brand: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 2,
  },
  qtyLabel: {
    width: 26,
    height: 44,
    borderWidth: 1.5,
    borderColor: "#111827",
    borderRadius: smallCornerRadius,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  qtyLabelText: {
    width: 54,
    textAlign: "center",
    fontSize: 10.8,
    transform: "rotate(90deg)",
    transformOrigin: "center center",
  },
  qtyInput: {
    marginTop: 3,
    borderWidth: 1.5,
    borderColor: "#8f97a3",
    borderRadius: smallCornerRadius,
    width: 26,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  qtyInputText: {
    width: 56,
    fontSize: 10.8,
    textAlign: "center",
    transform: "rotate(90deg)",
    transformOrigin: "center center",
  },
  customerRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  customerField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  customerFieldLabel: {
    width: 84,
    height: 20,
    borderWidth: 1.5,
    borderColor: "#111827",
    borderRadius: smallCornerRadius,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  customerFieldLabelText: {
    fontSize: 8.6,
    textAlign: "center",
  },
  customerFieldInput: {
    flex: 1,
    marginLeft: 4,
    borderWidth: 1.5,
    borderColor: "#8f97a3",
    borderRadius: smallCornerRadius,
    height: 20,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingHorizontal: 6,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  templateColumn: {
    width: templateWidth,
    marginRight: 0,
  },
  templateFrame: {
    position: "relative",
    width: templateWidth,
    height: templateHeight,
    overflow: "hidden",
  },
  templateImage: {
    position: "absolute",
    left: templateImageOffsetX,
    top: templateImageOffsetY,
    width: templateImageWidth,
    height: templateImageHeight,
  },
  measurementCell: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  measurementText: {
    fontSize: 12.8,
    fontWeight: "bold",
    color: "#1f2937",
  },
  measurementTextVertical: {
    transform: "rotate(90deg)",
    transformOrigin: "center center",
    textAlign: "center",
  },
  rightColumn: {
    flexGrow: 1,
  },
  matrixBlock: {
    marginTop: 20,
  },
  matrixHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 6,
  },
  matrixLabelSpacer: {
    width: 94,
  },
  matrixHeaderWrap: {
    width: 28,
    marginLeft: 3,
    alignItems: "center",
  },
  matrixHeaderCell: {
    width: 28,
    height: 104,
    borderWidth: 1.5,
    borderColor: "#7a8596",
    borderRadius: smallCornerRadius,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  matrixHeaderTextWrap: {
    width: 28,
    height: 104,
    alignItems: "center",
    justifyContent: "center",
  },
  matrixHeaderText: {
    fontSize: 6.2,
    lineHeight: 1.1,
    textAlign: "center",
    fontWeight: "bold",
    width: 58,
    transform: "rotate(90deg)",
    transformOrigin: "center center",
  },
  matrixRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 29,
  },
  matrixRowLabel: {
    width: 94,
    textAlign: "right",
    paddingRight: 6,
    fontSize: 9.4,
    fontWeight: "bold",
  },
  matrixCell: {
    width: 28,
    marginLeft: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  matrixCircle: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: "#8e96a6",
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  matrixCircleChecked: {
    borderColor: "#334155",
  },
  matrixDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#334155",
  },
  sideMetaColumn: {
    width: 30,
    marginLeft: 4,
    marginTop: 2,
    alignItems: "center",
  },
  sidebarBrand: {
    marginBottom: 4,
  },
  sideMetaItem: {
    marginBottom: 6,
    alignItems: "center",
  },
  sideMetaLabel: {
    width: 26,
    height: 96,
    borderWidth: 1.5,
    borderColor: "#111827",
    borderRadius: smallCornerRadius,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sideMetaLabelText: {
    width: 90,
    textAlign: "center",
    fontSize: 10.8,
    lineHeight: 1,
    transform: "rotate(90deg)",
    transformOrigin: "center center",
  },
  sideMetaValue: {
    marginTop: 4,
    width: 26,
    minHeight: 80,
    borderWidth: 1.5,
    borderColor: "#8f97a3",
    borderRadius: smallCornerRadius,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sideMetaValueText: {
    width: 88,
    fontSize: 10.8,
    textAlign: "center",
    transform: "rotate(90deg)",
    transformOrigin: "center center",
  },
  comments: {
    marginTop: 42,
  },
  commentsLabel: {
    fontSize: 10,
    marginBottom: 1,
  },
  commentRow: {
    justifyContent: "center",
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
    borderBottomStyle: "dotted",
    height: 12,
  },
  commentRowText: {
    fontSize: 8.6,
    maxLines: 1,
    textOverflow: "ellipsis",
  },
});

export function AlterationPdfDocument({
  measurementValues,
  reasonValues,
  meta,
}: AlterationPdfDocumentProps) {
  const typedCommentLines = meta.comments.split(/\r?\n/);
  const commentRows = commentsLineIndexes.map((lineIndex) => {
    if (
      lineIndex === commentsRowCount - 1 &&
      typedCommentLines.length > commentsRowCount
    ) {
      return typedCommentLines.slice(lineIndex).join(" ");
    }

    return typedCommentLines[lineIndex] ?? "";
  });

  return (
    <Document title={`Alteration ${meta.nFat || "Form"}`}>
      <Page size="A4" style={styles.page} wrap={false}>
        <View style={styles.sheet}>
          <View style={styles.sheetContent}>
            <View style={styles.mainColumn}>
              <View style={styles.topRow}>
                <View style={styles.topLeft}>
                  <Text style={styles.roundedLabel}>N FAT</Text>
                  <View style={styles.roundedInput}>
                    <Text style={styles.roundedInputText}>{meta.nFat}</Text>
                  </View>
                </View>

                <View style={styles.topCenter}>
                  <Text style={styles.title}>ALTERATION</Text>
                </View>

                <View style={styles.topRowRightSpacer} />
              </View>

              <View style={styles.customerRow}>
                <View style={styles.customerField}>
                  <View style={styles.customerFieldLabel}>
                    <Text style={styles.customerFieldLabelText}>
                      CUST. NAME
                    </Text>
                  </View>
                  <View style={styles.customerFieldInput}>
                    <Text style={styles.roundedInputText}>
                      {meta.customerName}
                    </Text>
                  </View>
                </View>

                <View style={styles.customerField}>
                  <View style={styles.customerFieldLabel}>
                    <Text style={styles.customerFieldLabelText}>
                      CUST PHONE
                    </Text>
                  </View>
                  <View style={styles.customerFieldInput}>
                    <Text style={styles.roundedInputText}>
                      {meta.customerPhone}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.bodyRow}>
                <View style={styles.templateColumn}>
                  <View style={styles.templateFrame}>
                    <Image src={templatePng} style={styles.templateImage} />

                    {defaultTemplateFieldLayout.map((field) => {
                      const value = (measurementValues[field.id] ?? "").trim();
                      const isVertical =
                        "orientation" in field &&
                        field.orientation === "vertical";

                      if (!value) {
                        return null;
                      }

                      return (
                        <View
                          key={field.id}
                          style={[
                            styles.measurementCell,
                            {
                              left:
                                (field.left / 100) *
                                  templateWidth *
                                  templateZoom +
                                templateImageOffsetX,
                              top:
                                (field.top / 100) *
                                  templateHeight *
                                  templateZoom +
                                templateImageOffsetY,
                              width:
                                (field.width / 100) *
                                templateWidth *
                                templateZoom,
                              height:
                                (field.height / 100) *
                                templateHeight *
                                templateZoom,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.measurementText,
                              ...(isVertical
                                ? [styles.measurementTextVertical]
                                : []),
                            ]}
                          >
                            {value}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.rightColumn}>
                  <View style={styles.matrixBlock}>
                    <View style={styles.matrixHeaderRow}>
                      <View style={styles.matrixLabelSpacer} />
                      {defaultAlterationIssueColumns.map((column) => (
                        <View key={column.id} style={styles.matrixHeaderWrap}>
                          <View style={styles.matrixHeaderCell}>
                            <View style={styles.matrixHeaderTextWrap}>
                              <Text style={styles.matrixHeaderText}>
                                {matrixHeaderLabels[column.id] ?? column.label}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>

                    {defaultAlterationIssueRows.map((row) => (
                      <View key={row.id} style={styles.matrixRow}>
                        <Text style={styles.matrixRowLabel}>{row.label}</Text>

                        {defaultAlterationIssueColumns.map((column) => {
                          const availableColumnIds = (
                            "columnIds" in row ? row.columnIds : undefined
                          ) as readonly string[] | undefined;
                          const isAvailable =
                            availableColumnIds?.includes(column.id) ?? true;

                          if (!isAvailable) {
                            return (
                              <View
                                key={`${row.id}-${column.id}`}
                                style={styles.matrixCell}
                              />
                            );
                          }

                          const checked = Boolean(
                            reasonValues[row.id]?.[column.id],
                          );

                          return (
                            <View
                              key={`${row.id}-${column.id}`}
                              style={styles.matrixCell}
                            >
                              <View
                                style={[
                                  styles.matrixCircle,
                                  ...(checked
                                    ? [styles.matrixCircleChecked]
                                    : []),
                                ]}
                              >
                                {checked ? (
                                  <View style={styles.matrixDot} />
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.comments}>
                <Text style={styles.commentsLabel}>COMMENTS:</Text>
                {commentRows.map((lineText, lineIndex) => (
                  <View key={lineIndex} style={styles.commentRow}>
                    <Text style={styles.commentRowText}>{lineText}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sideMetaColumn}>
              <Text style={[styles.brand, styles.sidebarBrand]}>ERTH</Text>

              <View style={styles.sideMetaItem}>
                <View style={styles.qtyLabel}>
                  <Text style={styles.qtyLabelText}>QTY</Text>
                </View>
                <View style={styles.qtyInput}>
                  <Text style={styles.qtyInputText}>{meta.qty}</Text>
                </View>
              </View>

              <View style={styles.sideMetaItem}>
                <View style={styles.sideMetaLabel}>
                  <Text style={styles.sideMetaLabelText}>BU/F/EXT</Text>
                </View>
                <View style={styles.sideMetaValue}>
                  <Text style={styles.sideMetaValueText}>{meta.bufiExt}</Text>
                </View>
              </View>

              <View style={styles.sideMetaItem}>
                <View style={styles.sideMetaLabel}>
                  <Text style={styles.sideMetaLabelText}>RECEIVED D.</Text>
                </View>
                <View style={styles.sideMetaValue}>
                  <Text style={styles.sideMetaValueText}>
                    {meta.receivedDate}
                  </Text>
                </View>
              </View>

              <View style={styles.sideMetaItem}>
                <View style={styles.sideMetaLabel}>
                  <Text style={styles.sideMetaLabelText}>REQUESTED D.</Text>
                </View>
                <View style={styles.sideMetaValue}>
                  <Text style={styles.sideMetaValueText}>
                    {meta.requestedDate}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
