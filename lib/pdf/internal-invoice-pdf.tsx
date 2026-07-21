import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  buildInternalInvoicePdfFilename,
  INTERNAL_INVOICE_PDF_MIME_TYPE,
  type InternalInvoiceDocumentModel,
} from "@/lib/business/internal-invoice-document";

const styles = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 48, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 9, color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingBottom: 16, marginBottom: 18 },
  eyebrow: { fontSize: 8, fontWeight: 700, color: "#1d4ed8", letterSpacing: 1.2, textTransform: "uppercase" },
  invoiceTitle: { fontSize: 23, fontWeight: 700, color: "#0f172a", marginTop: 5 },
  jobTitle: { fontSize: 9, color: "#64748b", marginTop: 5, maxWidth: 300 },
  logo: { maxWidth: 150, maxHeight: 54, objectFit: "contain" },
  businessName: { width: 180, fontSize: 15, fontWeight: 700, textAlign: "right", color: "#0f172a" },
  columns: { flexDirection: "row", gap: 12, marginBottom: 18 },
  card: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 12, backgroundColor: "#f8fafc" },
  cardTitle: { fontSize: 7.5, fontWeight: 700, color: "#64748b", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 7 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 4 },
  summaryLabel: { color: "#64748b" },
  summaryValue: { fontWeight: 700, color: "#0f172a", textAlign: "right" },
  billName: { fontSize: 10, fontWeight: 700, color: "#0f172a", marginBottom: 4 },
  secondary: { color: "#64748b", marginBottom: 2 },
  table: { borderWidth: 1, borderColor: "#cbd5e1", marginBottom: 14 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f1f5f9", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingVertical: 7, paddingHorizontal: 7 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.7, borderBottomColor: "#e2e8f0", paddingVertical: 8, paddingHorizontal: 7 },
  descriptionCol: { width: "46%", paddingRight: 8 },
  quantityCol: { width: "12%", textAlign: "right", paddingRight: 6 },
  priceCol: { width: "20%", textAlign: "right", paddingRight: 6 },
  subtotalCol: { width: "22%", textAlign: "right" },
  headerText: { fontSize: 7, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 },
  itemName: { fontWeight: 700, color: "#0f172a", marginBottom: 2 },
  itemDescription: { fontSize: 8, lineHeight: 1.35, color: "#64748b" },
  itemContext: { fontSize: 7, lineHeight: 1.3, color: "#475569", marginBottom: 2 },
  totals: { alignSelf: "flex-end", width: 240, borderTopWidth: 1, borderTopColor: "#cbd5e1", paddingTop: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  totalStrong: { fontSize: 11, fontWeight: 700, color: "#0f172a", paddingTop: 5, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  paid: { color: "#047857" },
  notes: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 10 },
  footer: { position: "absolute", bottom: 25, left: 42, right: 42, borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 7, fontSize: 7.5, color: "#64748b", flexDirection: "row", justifyContent: "space-between" },
});

function InvoicePdfDocument({ model, logoSource }: { model: InternalInvoiceDocumentModel; logoSource: string | null }) {
  const support = [model.business.supportEmail, model.business.supportPhone].filter(Boolean).join(" or ");
  return (
    <Document title={model.invoiceReference} author={model.business.displayName} subject="Invoice">
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.eyebrow}>Invoice</Text>
            <Text style={styles.invoiceTitle}>{model.invoiceReference}</Text>
            <Text style={styles.jobTitle}>{model.jobTitle}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image is not a DOM image */}
          {logoSource ? <Image src={logoSource} style={styles.logo} /> : <Text style={styles.businessName}>{model.business.displayName}</Text>}
        </View>

        <View style={styles.columns} wrap={false}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Summary</Text>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Invoice</Text><Text style={styles.summaryValue}>{model.invoiceReference}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Invoice Date</Text><Text style={styles.summaryValue}>{model.invoiceDateLabel}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Status</Text><Text style={[styles.summaryValue, model.paymentStatus === "paid" ? styles.paid : {}]}>{model.statusLabel}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Balance Due</Text><Text style={[styles.summaryValue, model.paymentStatus === "paid" ? styles.paid : {}]}>{model.balanceDueLabel}</Text></View>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Billing Recipient</Text>
            <Text style={styles.billName}>{model.billing.name}</Text>
            {model.billing.email ? <Text style={styles.secondary}>{model.billing.email}</Text> : null}
            {model.billing.phone ? <Text style={styles.secondary}>{model.billing.phone}</Text> : null}
            {model.billing.addressLines.map((line) => <Text key={line} style={styles.secondary}>{line}</Text>)}
            {model.serviceLocation ? <Text style={[styles.secondary, { marginTop: 6 }]}>Service location: {model.serviceLocation}</Text> : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            <Text style={[styles.descriptionCol, styles.headerText]}>Description</Text>
            <Text style={[styles.quantityCol, styles.headerText]}>Qty</Text>
            <Text style={[styles.priceCol, styles.headerText]}>Unit Price</Text>
            <Text style={[styles.subtotalCol, styles.headerText]}>Subtotal</Text>
          </View>
          {model.lineItems.length === 0 ? (
            <View style={styles.tableRow}><Text>No billed line items were recorded.</Text></View>
          ) : model.lineItems.map((item) => (
            <View key={item.key} style={styles.tableRow} wrap={false}>
              <View style={styles.descriptionCol}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.jobReference ? <Text style={styles.itemContext}>{item.jobReference} · {item.jobTitle}</Text> : null}
                {item.serviceLocation ? <Text style={styles.itemContext}>{item.serviceLocation}</Text> : null}
                {item.description ? <Text style={styles.itemDescription}>{item.description}</Text> : null}
              </View>
              <Text style={styles.quantityCol}>{item.quantityLabel}</Text>
              <Text style={styles.priceCol}>{item.unitPriceLabel}</Text>
              <Text style={styles.subtotalCol}>{item.subtotalLabel}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalRow}><Text>Subtotal</Text><Text>{model.subtotalLabel}</Text></View>
          <View style={styles.totalRow}><Text>Total</Text><Text>{model.totalLabel}</Text></View>
          {model.amountPaidCents > 0 ? <View style={styles.totalRow}><Text>Recorded Payments</Text><Text style={styles.paid}>-{model.amountPaidLabel}</Text></View> : null}
          <View style={[styles.totalRow, styles.totalStrong]}><Text>{model.paymentStatus === "paid" ? "Paid in Full" : "Balance Due"}</Text><Text style={model.paymentStatus === "paid" ? styles.paid : {}}>{model.balanceDueLabel}</Text></View>
        </View>

        {model.notes ? <View style={styles.notes} wrap={false}><Text style={styles.cardTitle}>Invoice Notes</Text><Text>{model.notes}</Text></View> : null}

        <View style={styles.footer} fixed>
          <Text>Questions? Contact {model.business.displayName}{support ? ` at ${support}` : ""}.</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

async function resolveLogoDataUrl(logoUrl: string | null) {
  if (!logoUrl) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(logoUrl, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return null;
    const contentType = String(response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!new Set(["image/png", "image/jpeg"]).has(contentType)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) return null;
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function renderInternalInvoicePdf(model: InternalInvoiceDocumentModel) {
  const logoSource = await resolveLogoDataUrl(model.business.logoUrl);
  const buffer = await renderToBuffer(<InvoicePdfDocument model={model} logoSource={logoSource} />);
  if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Invoice PDF renderer returned an invalid document.");
  }
  return buffer;
}

export async function buildInternalInvoicePdfAttachment(model: InternalInvoiceDocumentModel) {
  return {
    filename: buildInternalInvoicePdfFilename(model.invoiceNumber),
    contentType: INTERNAL_INVOICE_PDF_MIME_TYPE,
    content: await renderInternalInvoicePdf(model),
  };
}
