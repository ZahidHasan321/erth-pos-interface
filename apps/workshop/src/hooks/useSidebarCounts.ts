import { useQuery } from '@tanstack/react-query';
import { db } from "@/lib/db";

interface SidebarCounts {
  receiving: number;
  parking: number;
  scheduler: number;
  soaking: number;
  cutting: number;
  post_cutting: number;
  sewing: number;
  finishing: number;
  ironing: number;
  quality_check: number;
  dispatch: number;
}

async function fetchCounts(): Promise<SidebarCounts> {
  const { data, error } = await db
    .from('garments')
    .select('piece_stage, location, in_production, production_plan')
    .in('location', ['workshop', 'transit_to_workshop'])
    .in('piece_stage', [
      'waiting_cut',
      'soaking', 'cutting', 'post_cutting', 'sewing', 'finishing', 'ironing',
      'quality_check', 'ready_for_dispatch', 'brova_trialed',
    ]);

  if (error || !data) return {
    receiving: 0, parking: 0, scheduler: 0,
    soaking: 0, cutting: 0, post_cutting: 0,
    sewing: 0, finishing: 0, ironing: 0,
    quality_check: 0, dispatch: 0,
  };

  return {
    receiving:     data.filter((g) => g.location === 'transit_to_workshop').length,
    parking:       data.filter((g) => g.location === 'workshop' && !g.in_production).length,
    scheduler:     data.filter((g) => g.location === 'workshop' && g.in_production && !g.production_plan && g.piece_stage === 'waiting_cut').length,
    soaking:       data.filter((g) => g.piece_stage === 'soaking').length,
    cutting:       data.filter((g) => g.piece_stage === 'cutting').length,
    post_cutting:  data.filter((g) => g.piece_stage === 'post_cutting').length,
    sewing:        data.filter((g) => g.piece_stage === 'sewing').length,
    finishing:     data.filter((g) => g.piece_stage === 'finishing').length,
    ironing:       data.filter((g) => g.piece_stage === 'ironing').length,
    quality_check: data.filter((g) => g.piece_stage === 'quality_check').length,
    dispatch:      data.filter((g) => g.location === 'workshop' && ['ready_for_dispatch', 'brova_trialed'].includes(g.piece_stage ?? '')).length,
  };
}

export function useSidebarCounts() {
  return useQuery({
    queryKey: ['sidebar-counts'],
    queryFn: fetchCounts,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
