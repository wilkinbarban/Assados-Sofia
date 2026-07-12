-- Tornar bucket produto-imagens público para exibição de fotos nos cards
UPDATE storage.buckets SET public = true WHERE id = 'produto-imagens';
