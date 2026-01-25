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
    brova: boolean;
    express: boolean;
    deliveryDate: Date | null;
  };
}

export const FabricLabel = React.forwardRef<HTMLDivElement, FabricLabelProps>(
  ({ fabricData }, ref) => {
    const { main } = useParams({ strict: false }) as { main?: string };
    const logo = main === BRAND_NAMES.showroom ? erthLogo : sakkbaLogo;

    const { data: fabricsResponse } = useQuery({
      queryKey: ["fabrics"],
      queryFn: getFabrics,
      staleTime: Infinity,
      gcTime: Infinity,
    });

    const fabrics = fabricsResponse?.data || [];

    // Look up the fabric name if source is IN
    const fabricName = React.useMemo(() => {
      if (fabricData.fabricSource === 'IN' && fabricData.fabricId) {
        const fabric = fabrics.find(f => f.id.toString() === fabricData.fabricId.toString());
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
          fontFamily: 'Arial, sans-serif',
          fontSize: '16px',
          padding: '0',
          margin: '0 auto'
        }}
      >
        <div>
          {/* Logo */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '8px 4px',
            borderBottom: '2px solid black'
          }}>
            <img
              src={logo}
              alt={main === BRAND_NAMES.showroom ? 'ERTH Logo' : 'Sakkba Logo'}
              style={{
                height: '50px',
                width: 'auto',
                objectFit: 'contain'
              }}
            />
          </div>

          {/* Header - Order ID and Customer Mobile */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            borderBottom: '2px solid black'
          }}>
            <div style={{
              textAlign: 'center',
              padding: '6px 4px',
              borderRight: '1px solid #ccc',
              fontSize: '16px',
              fontWeight: 'bold'
            }}>
              Order ID: {fabricData.orderId}
            </div>
            <div style={{
              textAlign: 'center',
              padding: '6px 4px',
              fontSize: '16px',
              fontWeight: 'bold'
            }}>
              Mobile: {fabricData.customerMobile}
            </div>
          </div>

          {/* Customer Details Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            borderBottom: '2px solid black'
          }}>
            <div style={{
              textAlign: 'center',
              padding: '5px 4px',
              borderRight: '1px solid #ccc'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>Customer ID</div>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{fabricData.customerId}</div>
            </div>
            <div style={{
              textAlign: 'center',
              padding: '5px 4px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>Customer Name</div>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{fabricData.customerName}</div>
            </div>
          </div>

          {/* Garment Details Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            borderBottom: '2px solid black'
          }}>
            <div style={{
              textAlign: 'center',
              padding: '5px 4px',
              borderRight: '1px solid #ccc'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>Garment ID</div>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{fabricData.garmentId}</div>
            </div>
            <div style={{
              textAlign: 'center',
              padding: '5px 4px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>Source</div>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
                {fabricName}
              </div>
            </div>
          </div>

          {/* Measurement Details Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            borderBottom: '2px solid black'
          }}>
            <div style={{
              textAlign: 'center',
              padding: '5px 4px',
              borderRight: '1px solid #ccc'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>Status</div>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{fabricData.brova ? 'Brova' : 'Final'}</div>
            </div>
            <div style={{
              textAlign: 'center',
              padding: '5px 4px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>Express Delivery</div>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{fabricData.express ? 'Yes' : 'No'}</div>
            </div>
          </div>

          {/* Delivery Date */}
          <div style={{
            textAlign: 'center',
            padding: '5px 4px',
            fontSize: '16px',
            fontWeight: 'bold',
            borderBottom: '2px solid black'
          }}>
            Delivery Date: {formatDate(fabricData.deliveryDate)}
          </div>

          {/* Barcode */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '4px'
          }}>
            <Barcode
              value={JSON.stringify({
                orderId: fabricData.orderId,
                garmentId: fabricData.garmentId
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