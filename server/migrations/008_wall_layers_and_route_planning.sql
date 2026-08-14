ALTER TABLE walls ADD COLUMN structural_thickness_mm INTEGER NOT NULL DEFAULT 120 CHECK (structural_thickness_mm > 0);
ALTER TABLE walls ADD COLUMN lining_left_mm INTEGER NOT NULL DEFAULT 0 CHECK (lining_left_mm >= 0);
ALTER TABLE walls ADD COLUMN lining_right_mm INTEGER NOT NULL DEFAULT 0 CHECK (lining_right_mm >= 0);

UPDATE walls
SET structural_thickness_mm = thickness_mm,
    lining_left_mm = 0,
    lining_right_mm = 0;
