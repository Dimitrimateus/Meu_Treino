-- 0005 — Tipos iniciais (editáveis/apagáveis pelo admin)
insert into public.exercise_types (name, color) values
  ('Peito',   '#2563EB'),
  ('Costas',  '#0891B2'),
  ('Pernas',  '#16A34A'),
  ('Ombros',  '#7C3AED'),
  ('Bíceps',  '#DB2777'),
  ('Tríceps', '#EA580C'),
  ('Abdômen', '#CA8A04'),
  ('Glúteos', '#DC2626'),
  ('Cardio',  '#475569')
on conflict do nothing;
