import React, { useRef, useState } from 'react';
import { FeeRecord, Installment, StudentInfo } from '@/contexts/AppDataContext';
import { Printer, Download, FileText, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from './ui/button';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface ReceiptGeneratorProps {
  feeRecord: FeeRecord;
  installment: Installment;
  studentDetails: Partial<StudentInfo>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ReceiptGenerator: React.FC<ReceiptGeneratorProps> = ({ 
  feeRecord, 
  installment, 
  studentDetails,
  open,
  onOpenChange,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handlePrint = () => {
    const printContent = receiptRef.current;
    if (!printContent) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt ${installment.receiptNo}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
            body { padding: 30px; color: #111; }
            table { border-collapse: collapse; width: 100%; }
            td, th { padding: 8px; }
            .border { border: 1px solid #ddd; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #222; padding-bottom: 20px; margin-bottom: 20px; }
            .logo-section { display: flex; align-items: center; gap: 16px; }
            .logo-section img { width: 80px; height: 80px; object-fit: contain; }
            .title { font-size: 22px; font-weight: bold; text-transform: uppercase; }
            .subtitle { font-size: 13px; color: #666; }
            .badge { background: #111; color: #fff; padding: 8px 16px; text-transform: uppercase; font-weight: bold; font-size: 15px; border-radius: 4px; display: inline-block; margin-bottom: 8px; }
            .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; color: #888; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 10px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
            .label { font-weight: 500; min-width: 120px; padding: 4px 0; }
            .value { padding: 4px 0; }
            .value.bold { font-weight: bold; }
            .summary-box { width: 250px; margin-left: auto; background: #f9f9f9; padding: 16px; border-radius: 8px; border: 1px solid #eee; }
            .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
            .divider { height: 1px; background: #ddd; margin: 8px 0; }
            .balance { font-weight: bold; color: #dc2626; font-size: 16px; }
            .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 80px; }
            .disclaimer { font-size: 11px; color: #888; }
            .sig-line { width: 180px; border-bottom: 1px solid #999; margin-bottom: 8px; }
            .sig-label { font-size: 13px; font-weight: bold; text-align: center; }
            .sig-sub { font-size: 11px; color: #888; text-align: center; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>${printContent.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  const handleDownloadPDF = async () => {
    if (!receiptRef.current) return;
    try {
      setIsDownloading(true);
      const canvas = await html2canvas(receiptRef.current, { 
        scale: 2, 
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Receipt_${installment.receiptNo}_${feeRecord.student.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error("Failed to generate PDF", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const balance = (feeRecord.finalAmount || feeRecord.amount) - (feeRecord.received || 0);

  let planLabel = "";
  if (feeRecord.installments && feeRecord.installments.length > 2) {
    planLabel = "Plan Option B/C";
  } else {
    planLabel = "Plan Option A / Default";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Receipt Preview
          </DialogTitle>
        </DialogHeader>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 px-4 pb-3 border-b">
          <Button onClick={handlePrint} variant="outline" className="gap-2">
            <Printer className="w-4 h-4" /> Print
          </Button>
          <Button onClick={handleDownloadPDF} disabled={isDownloading} className="gap-2">
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} 
            {isDownloading ? "Generating..." : "Download PDF"}
          </Button>
        </div>

        {/* Receipt Content */}
        <div 
          ref={receiptRef}
          className="p-8 bg-white text-black mx-auto w-full" 
          style={{ minHeight: 700 }}
        >
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #222', paddingBottom: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <img 
                src="/WhatsApp Image 2026-02-04 at 11.06.19.jpeg" 
                alt="ARK Learning Arena Logo" 
                style={{ width: '80px', height: '80px', objectFit: 'contain' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', color: '#111' }}>ARK Learning Arena</div>
                <div style={{ fontSize: '13px', color: '#666' }}>No 2/31, Mugappair West, Chennai</div>
                <div style={{ fontSize: '13px', color: '#666' }}>Phone: 7358199217 | www.arklearning.com</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ background: '#111', color: '#fff', padding: '8px 16px', textTransform: 'uppercase', fontWeight: 'bold', fontSize: '15px', borderRadius: '4px', display: 'inline-block', marginBottom: '8px' }}>
                Payment Receipt
              </div>
              <div style={{ fontSize: '13px' }}><span style={{ fontWeight: 600 }}>Receipt No:</span> {installment.receiptNo}</div>
              <div style={{ fontSize: '13px' }}><span style={{ fontWeight: 600 }}>Date:</span> {new Date(installment.date).toLocaleDateString()}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
            {/* Student Details */}
            <div>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', color: '#888', borderBottom: '1px solid #eee', paddingBottom: '4px', marginBottom: '10px' }}>Student Details</div>
              <table style={{ fontSize: '13px', width: '100%' }}>
                <tbody>
                  <tr><td style={{ padding: '4px 0', fontWeight: 500, minWidth: '120px' }}>Student Name:</td><td style={{ padding: '4px 0', fontWeight: 'bold' }}>{feeRecord.student}</td></tr>
                  <tr><td style={{ padding: '4px 0', fontWeight: 500 }}>Class & Batch:</td><td style={{ padding: '4px 0' }}>{feeRecord.batch}</td></tr>
                  <tr><td style={{ padding: '4px 0', fontWeight: 500 }}>Campus:</td><td style={{ padding: '4px 0' }}>{studentDetails?.campus || "N/A"}</td></tr>
                </tbody>
              </table>
            </div>
            
            {/* Payment Meta */}
            <div>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', color: '#888', borderBottom: '1px solid #eee', paddingBottom: '4px', marginBottom: '10px' }}>Payment Information</div>
              <table style={{ fontSize: '13px', width: '100%' }}>
                <tbody>
                  <tr><td style={{ padding: '4px 0', fontWeight: 500, minWidth: '120px' }}>Payment Mode:</td><td style={{ padding: '4px 0' }}>{installment.method}</td></tr>
                  <tr><td style={{ padding: '4px 0', fontWeight: 500 }}>Installment Ref:</td><td style={{ padding: '4px 0', fontWeight: 500 }}>Fee Collection</td></tr>
                  <tr><td style={{ padding: '4px 0', fontWeight: 500 }}>Plan:</td><td style={{ padding: '4px 0' }}>{planLabel}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Details Table */}
          <table style={{ width: '100%', fontSize: '13px', marginBottom: '30px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left', fontWeight: 600 }}>Description</th>
                <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'right', fontWeight: 600, width: '140px' }}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                  <div style={{ fontWeight: 500 }}>Fee Payment</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>Towards {feeRecord.batch} tuition fees</div>
                </td>
                <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'right', fontWeight: 'bold', fontSize: '16px' }}>
                  ₹{installment.amount.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Summary */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '40px' }}>
            <div style={{ width: '250px', background: '#f9f9f9', padding: '16px', borderRadius: '8px', border: '1px solid #eee' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                <span style={{ color: '#666' }}>Total Program Fee:</span>
                <span style={{ fontWeight: 500 }}>₹{(feeRecord.finalAmount || feeRecord.amount).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                <span style={{ color: '#666' }}>Total Paid Till Date:</span>
                <span style={{ fontWeight: 500 }}>₹{(feeRecord.received || 0).toLocaleString()}</span>
              </div>
              <div style={{ height: '1px', background: '#ddd', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', padding: '4px 0' }}>
                <span style={{ fontWeight: 'bold' }}>Balance Remaining:</span>
                <span style={{ fontWeight: 'bold', color: '#dc2626' }}>₹{balance > 0 ? balance.toLocaleString() : '0'}</span>
              </div>
            </div>
          </div>

          {/* Footer & Signature */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '60px' }}>
            <div style={{ fontSize: '11px', color: '#888' }}>
              <p>• This is a computer-generated receipt.</p>
              <p>• No physical signature is required.</p>
              <p style={{ fontStyle: 'italic', marginTop: '12px', color: '#555', fontWeight: 500 }}>Thank you for choosing ARK Learning Arena!</p>
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '180px', borderBottom: '1px solid #999', marginBottom: '8px' }}></div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>Authorized Signatory</div>
              <div style={{ fontSize: '11px', color: '#888' }}>ARK Learning Arena</div>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiptGenerator;
