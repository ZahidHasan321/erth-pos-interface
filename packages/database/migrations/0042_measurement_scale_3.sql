-- 0042: widen measurement dimensions from numeric(5,2) to numeric(6,3).
--
-- Body measurements are entered in eighth-inch increments. Exact eighths
-- (.125/.375/.625/.875) do not survive 2 decimal places, so a jabzour_width
-- of 1.625 was stored as 1.63 -- which then never matches its 1.625 dropdown
-- option on edit (the field rehydrates blank). scale 3 stores eighths exactly.
--
-- precision widened 5 -> 6 as well: some existing import rows hold values up to
-- ~814, which fit numeric(6,3) (max 999.999) but NOT numeric(5,3) (max 99.999).
-- So we keep 3 integer digits -> precision 6.
--
-- No data backfill here: existing 2dp values are left as-is (they still display
-- correctly since fraction rendering re-snaps to the nearest eighth).

ALTER TABLE measurements
  ALTER COLUMN collar_width            TYPE numeric(6,3),
  ALTER COLUMN collar_height           TYPE numeric(6,3),
  ALTER COLUMN shoulder                TYPE numeric(6,3),
  ALTER COLUMN chest_upper             TYPE numeric(6,3),
  ALTER COLUMN chest_full              TYPE numeric(6,3),
  ALTER COLUMN sleeve_length           TYPE numeric(6,3),
  ALTER COLUMN sleeve_width            TYPE numeric(6,3),
  ALTER COLUMN elbow                   TYPE numeric(6,3),
  ALTER COLUMN top_pocket_length       TYPE numeric(6,3),
  ALTER COLUMN top_pocket_width        TYPE numeric(6,3),
  ALTER COLUMN top_pocket_distance     TYPE numeric(6,3),
  ALTER COLUMN side_pocket_length      TYPE numeric(6,3),
  ALTER COLUMN side_pocket_width       TYPE numeric(6,3),
  ALTER COLUMN side_pocket_distance    TYPE numeric(6,3),
  ALTER COLUMN side_pocket_opening     TYPE numeric(6,3),
  ALTER COLUMN waist_front             TYPE numeric(6,3),
  ALTER COLUMN waist_back              TYPE numeric(6,3),
  ALTER COLUMN waist_full              TYPE numeric(6,3),
  ALTER COLUMN length_front            TYPE numeric(6,3),
  ALTER COLUMN length_back             TYPE numeric(6,3),
  ALTER COLUMN bottom                  TYPE numeric(6,3),
  ALTER COLUMN chest_provision         TYPE numeric(6,3),
  ALTER COLUMN waist_provision         TYPE numeric(6,3),
  ALTER COLUMN degree                  TYPE numeric(6,3),
  ALTER COLUMN jabzour_width           TYPE numeric(6,3),
  ALTER COLUMN jabzour_length          TYPE numeric(6,3),
  ALTER COLUMN chest_front             TYPE numeric(6,3),
  ALTER COLUMN chest_back              TYPE numeric(6,3),
  ALTER COLUMN armhole_front           TYPE numeric(6,3),
  ALTER COLUMN second_button_distance  TYPE numeric(6,3),
  ALTER COLUMN basma_length            TYPE numeric(6,3),
  ALTER COLUMN basma_width             TYPE numeric(6,3),
  ALTER COLUMN sleeve_hemming          TYPE numeric(6,3),
  ALTER COLUMN bottom_hemming          TYPE numeric(6,3),
  ALTER COLUMN pen_pocket_length       TYPE numeric(6,3),
  ALTER COLUMN pen_pocket_width        TYPE numeric(6,3);
