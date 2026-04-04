import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFabrics } from '@/api/fabrics';
import Barcode from 'react-barcode';
import { BRAND_NAMES } from '@/lib/constants';
import { useParams } from '@tanstack/react-router';
import erthLogo from '@/assets/erth-light.svg';
import sakkbaLogo from '@/assets/Sakkba.png';

interface FabricLabelProps {
  fabricData: {
    orderId: number | string;
    customerId: number | string;
    customerName: string;
    customerMobile: string;
    garmentId: string;
    fabricSource: string;
    fabricId: number | string | null;
    fabricLength: number | string;
    measurementId: string;
    garment_type: 'brova' | 'final';
    express: boolean;
    soaking: boolean;
    deliveryDate: Date | null;
    notes?: string;
    invoiceNumber?: string;
  };
}

export const FabricLabel = React.forwardRef<HTMLDivElement, FabricLabelProps>(
  ({ fabricData }, ref) => {
    const { main } = useParams({ strict: false }) as { main?: string };
    const logo = main === BRAND_NAMES.showroom ? erthLogo : sakkbaLogo;

    const { data: fabrics = [] } = useQuery({
      queryKey: ["fabrics"],
      queryFn: getFabrics,
      staleTime: Infinity,
      gcTime: Infinity,
    });

    // Look up the fabric name if source is IN
    const fabricName = React.useMemo(() => {
      if (fabricData.fabricSource === 'IN' && fabricData.fabricId) {
        const fabric = fabrics.find(f => f.id.toString() === fabricData.fabricId!.toString());
        return fabric?.name || 'N/A';
      }
      return 'Out';
    }, [fabricData.fabricSource, fabricData.fabricId, fabrics]);

    const formatDate = (date: Date | string | null | undefined) => {
      if (!date) return "N/A";
      const d = new Date(date);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    };

    return (
      <div
        ref={ref}
        className="bg-white text-black"
        style={{
          width: '450px',
          fontFamily: "'Cairo', 'IBM Plex Sans Arabic', Arial, sans-serif",
          fontSize: '16px',
          padding: '0',
          margin: '0 auto',
          border: '2px solid black',
        }}
      >
        <div>
          {/* Row 1: Express | Logo | Soaking */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            borderBottom: '2px solid black',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 4px',
              borderRight: '1px solid #ccc',
              borderTop: fabricData.express ? '3px solid #dc2626' : '3px solid transparent',
            }}>
              <span style={{
                fontSize: '18px',
                fontWeight: '900',
                color: fabricData.express ? '#dc2626' : 'transparent',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}>
                Express
              </span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 4px',
              borderRight: '1px solid #ccc',
            }}>
              <img
                src={logo}
                alt={main === BRAND_NAMES.showroom ? 'ERTH Logo' : 'Sakkba Logo'}
                style={{
                  height: '40px',
                  width: 'auto',
                  objectFit: 'contain',
                }}
              />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 4px',
              borderTop: fabricData.soaking ? '3px solid #2563eb' : '3px solid transparent',
            }}>
              <span style={{
                fontSize: '18px',
                fontWeight: '900',
                color: fabricData.soaking ? '#2563eb' : 'transparent',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}>
                Soaking
              </span>
            </div>
          </div>

          {/* Row 2: Order ID label | Customer Name label | Invoice label */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            borderBottom: '1px solid #ccc',
          }}>
            <div style={{ textAlign: 'center', padding: '4px', borderRight: '1px solid #ccc' }}>
              <div style={{ fontSize: '12px', fontWeight: '600' }}>Order ID</div>
            </div>
            <div style={{ textAlign: 'center', padding: '4px', borderRight: '1px solid #ccc' }}>
              <div style={{ fontSize: '12px', fontWeight: '600' }}>Mobile no.</div>
            </div>
            <div style={{ textAlign: 'center', padding: '4px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600' }}>Invoice</div>
            </div>
          </div>

          {/* Row 3: Order ID value | Mobile no. | Invoice value */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            borderBottom: '2px solid black',
          }}>
            <div style={{ textAlign: 'center', padding: '4px', borderRight: '1px solid #ccc' }}>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{fabricData.orderId || "N/A"}</div>
            </div>
            <div style={{ textAlign: 'center', padding: '4px', borderRight: '1px solid #ccc' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{fabricData.customerMobile || "N/A"}</div>
            </div>
            <div style={{ textAlign: 'center', padding: '4px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{fabricData.invoiceNumber || ""}</div>
            </div>
          </div>

          {/* Row 4: Garment ID | Customer Name */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            borderBottom: '2px solid black',
          }}>
            <div style={{
              textAlign: 'center',
              padding: '5px 4px',
              borderRight: '1px solid #ccc',
            }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>Garment ID</div>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{fabricData.garmentId || "N/A"}</div>
            </div>
            <div style={{
              textAlign: 'center',
              padding: '5px 4px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>Customer Name</div>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{fabricData.customerName || "N/A"}</div>
            </div>
          </div>

          {/* Row 5: Source | Status */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            borderBottom: '2px solid black',
          }}>
            <div style={{
              textAlign: 'center',
              padding: '5px 4px',
              borderRight: '1px solid #ccc',
            }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>Source</div>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{fabricName}</div>
            </div>
            <div style={{
              textAlign: 'center',
              padding: '5px 4px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>Status</div>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{fabricData.garment_type === 'brova' ? 'Brova' : 'Final'}</div>
            </div>
          </div>

          {/* Row 6: Delivery Date */}
          <div style={{
            textAlign: 'center',
            padding: '5px 4px',
            fontSize: '16px',
            fontWeight: 'bold',
            borderBottom: '2px solid black',
          }}>
            Delivery Date: {formatDate(fabricData.deliveryDate)}
          </div>

          {/* Row 7: Notes */}
          <div style={{
            textAlign: 'center',
            padding: '5px 4px',
            fontSize: '14px',
            minHeight: '28px',
            borderBottom: '2px solid black',
          }}>
            {fabricData.notes || ""}
          </div>

          {/* Barcode */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '4px',
          }}>
            <Barcode
              value={JSON.stringify({
                orderId: fabricData.orderId,
                garmentId: fabricData.garmentId,
              })}
              width={1.2}
              height={40}
              fontSize={10}
              displayValue={false}
              margin={0}
            />
          </div>
        </div>
      </div>
    );
  }
);