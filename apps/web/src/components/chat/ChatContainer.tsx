'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Image from 'next/image';
import { 
  Flame, 
  Paperclip, 
  Send, 
  X, 
  Image as ImageIcon, 
  FileText, 
  Sparkles, 
  User, 
  UserCheck, 
  Loader2, 
  Download,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Clock,
  Utensils,
  ChevronRight,
  PackageCheck,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { novaMensagemSchema } from '@/lib/validation/chat';
import { processarIaChat } from '@/app/actions/chat';
import { BrandLogo } from '@/components/ui/BrandLogo';
import {
  actionObterCarrinhoAtivo,
  actionAdicionarItemAoCarrinho,
  actionAtualizarQuantidadeItem,
  actionRemoverItemDoCarrinho,
  actionLimparCarrinho,
} from '@/app/actions/carrinho';
import type { CarrinhoCompleto } from '@/lib/carrinho/service';

interface Conversa {
  id: string;
  cliente_id: string;
  status: 'ia_atendendo' | 'aberta' | 'fechada';
  ia_ativa: boolean;
  data_criacao: string;
  data_atualizacao: string;
}

interface Mensagem {
  id: string;
  conversa_id: string;
  remetente: 'cliente' | 'operador' | 'ia';
  conteudo: string | null;
  url_anexo: string | null;
  data_criacao: string;
  whatsapp_mensagem_id?: string | null;
  telegram_mensagem_id?: string | null;
}

interface Produto {
  id: string;
  nome: string;
  descricao: string | null;
  preco_centavos: number;
  url_imagem: string | null;
  url_imagem_thumb: string | null;
}

interface ChatContainerProps {
  clienteNome: string;
  conversaInicial: Conversa;
  mensagensIniciais: Mensagem[];
  produtos?: Produto[];
}

const HORARIOS_RETIRADA = [
  '11:30',
  '11:45',
  '12:00',
  '12:15',
  '12:30',
  '12:45',
  '13:00',
  '13:15',
];

interface MessageCardapioRendererProps {
  conteudo: string;
  produtos: Produto[];
  onAdicionarAoCarrinho: (produto: Produto) => void;
  isIa: boolean;
}

function ChatMessageCardapioRenderer({
  conteudo,
  produtos,
  onAdicionarAoCarrinho,
  isIa,
}: MessageCardapioRendererProps) {
  if (!isIa || (!conteudo.includes('📷') && !conteudo.includes('💰'))) {
    return <p className="whitespace-pre-wrap break-words leading-relaxed">{conteudo}</p>;
  }

  // Dividir por blocos de parágrafos
  const blocos = conteudo.split(/\n\n+/);

  return (
    <div className="space-y-3">
      {blocos.map((bloco, idx) => {
        const hasFoto = bloco.includes('📷');
        const hasPreco = bloco.includes('💰');

        if (hasFoto && hasPreco) {
          // Extrair foto URL
          const fotoMatch = bloco.match(/📷\s*(https?:\/\/\S+)/);
          const fotoUrl = fotoMatch ? fotoMatch[1] : null;

          // Extrair linhas
          const linhas = bloco.split('\n').filter((l) => !l.startsWith('📷'));
          const tituloLinha = linhas[0]?.replace(/^[*_~•📌🍗🥩👑✨]+|[*_~•]+$/g, '').trim() || 'Assado Especial';

          // Encontrar produto correspondente no catálogo
          const prodEncontrado = produtos.find((p) => {
            const pNome = p.nome.toLowerCase();
            const tNome = tituloLinha.toLowerCase();
            if (tNome.includes('combo 1') && pNome.includes('combo 1')) return true;
            if (tNome.includes('combo 2') && pNome.includes('combo 2')) return true;
            if (tNome.includes('combo 3') && pNome.includes('combo 3')) return true;
            if (tNome.includes('combo 4') && pNome.includes('combo 4')) return true;
            if (tNome.includes('costela') && pNome.includes('costela')) return true;
            if (tNome.includes('frango') && pNome.includes('frango')) return true;
            return tNome.includes(pNome) || pNome.includes(tNome);
          });

          // Extrair preço
          const precoMatch = bloco.match(/💰\s*\*?([^*_🛒👀\n]+)\*?/);
          const precoTxt = precoMatch ? precoMatch[1].trim() : (prodEncontrado ? (prodEncontrado.preco_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null);

          // Extrair descrição/bullets
          const descricaoLinhas = linhas.slice(1).filter((l) => !l.includes('💰') && !l.includes('🛒') && !l.includes('👀'));

          return (
            <div
              key={idx}
              className="rounded-2xl border border-zinc-800/90 bg-zinc-950/80 p-3 shadow-xl space-y-2.5 backdrop-blur-xs max-w-sm my-2"
            >
              {fotoUrl && (
                <div className="relative w-full h-36 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fotoUrl}
                    alt={tituloLinha}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
              )}

              <div>
                <h4 className="font-bold text-zinc-100 text-sm flex items-center gap-1.5">
                  <span>{tituloLinha}</span>
                </h4>

                {descricaoLinhas.length > 0 && (
                  <div className="mt-1.5 space-y-0.5 text-xs text-zinc-400">
                    {descricaoLinhas.map((dl, dIdx) => (
                      <p key={dIdx} className="leading-snug">
                        {dl.replace(/[*_]/g, '')}
                      </p>
                    ))}
                  </div>
                )}

                {precoTxt && (
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-base font-black font-mono text-emerald-400">
                      {precoTxt}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
                {prodEncontrado ? (
                  <button
                    type="button"
                    onClick={() => onAdicionarAoCarrinho(prodEncontrado)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer select-none"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    <span>Adicionar ao pedido</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (produtos.length > 0) onAdicionarAoCarrinho(produtos[0]);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer select-none"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    <span>Quero esse combo</span>
                  </button>
                )}
              </div>
            </div>
          );
        }

        return (
          <p key={idx} className="whitespace-pre-wrap break-words leading-relaxed">
            {bloco}
          </p>
        );
      })}
    </div>
  );
}

export default function ChatContainer({
  clienteNome,
  conversaInicial,
  mensagensIniciais,
  produtos = [],
}: ChatContainerProps) {
  const supabase = useMemo(() => createClient(), []);
  const [conversa, setConversa] = useState<Conversa>(conversaInicial);
  const [mensagens, setMensagens] = useState<Mensagem[]>(mensagensIniciais);
  
  // Cart state
  const [carrinho, setCarrinho] = useState<CarrinhoCompleto | null>(null);
  const [loadingCarrinho, setLoadingCarrinho] = useState(false);
  const [cartUpdatingId, setCartUpdatingId] = useState<string | null>(null);
  const [horarioRetirada, setHorarioRetirada] = useState<string>('12:00');
  const [sidebarTab, setSidebarTab] = useState<'cardapio' | 'carrinho'>('cardapio');
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [sendingOrderSummary, setSendingOrderSummary] = useState(false);

  // Input & Upload States
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isIaTyping, setIsIaTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentType, setAttachmentType] = useState<string | null>(null);
  const [attachmentSize, setAttachmentSize] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Carregar carrinho ativo do cliente
  const carregarCarrinho = useCallback(async () => {
    if (!conversa.cliente_id) return;
    setLoadingCarrinho(true);
    try {
      const res = await actionObterCarrinhoAtivo(conversa.cliente_id);
      if (res.success && res.carrinho) {
        setCarrinho(res.carrinho);
        if (res.carrinho.horario_retirada) {
          setHorarioRetirada(res.carrinho.horario_retirada);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar carrinho do cliente:', err);
    } finally {
      setLoadingCarrinho(false);
    }
  }, [conversa.cliente_id]);

  useEffect(() => {
    carregarCarrinho();
  }, [carregarCarrinho]);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  // Scroll to bottom on initial load or new messages
  useEffect(() => {
    scrollToBottom();
  }, [mensagens]);

  // Adjust textarea height dynamically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [inputValue]);

  // Fetch signed URLs for private attachments in bulk
  useEffect(() => {
    const fetchSignedUrls = async () => {
      const pendingPaths = mensagens
        .map((m) => m.url_anexo)
        .filter((url): url is string => !!url && !url.startsWith('http') && !signedUrls[url]);

      if (pendingPaths.length === 0) return;

      const newUrls = { ...signedUrls };
      for (const path of pendingPaths) {
        try {
          const { data, error } = await supabase.storage
            .from('chat-midias')
            .createSignedUrl(path, 3600); // 1 hour validity

          if (error) {
            throw error;
          }

          if (data?.signedUrl) {
            newUrls[path] = data.signedUrl;
          }
        } catch (err) {
          console.error('Erro ao obter URL assinada:', err);
        }
      }
      setSignedUrls(newUrls);
    };

    fetchSignedUrls();
  }, [mensagens, signedUrls, supabase]);

  // Realtime subscription for new messages and conversation updates
  useEffect(() => {
    const channel = supabase
      .channel(`conversa:${conversa.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `conversa_id=eq.${conversa.id}`,
        },
        (payload) => {
          const novaMsg = payload.new as Mensagem;
          setMensagens((prev) => {
            if (prev.some((m) => m.id === novaMsg.id)) {
              return prev;
            }
            return [...prev, novaMsg];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversas',
          filter: `id=eq.${conversa.id}`,
        },
        (payload) => {
          const novaConversa = payload.new as Conversa;
          setConversa(novaConversa);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversa.id, supabase]);

  // Actions de Carrinho
  const handleAdicionarAoCarrinho = async (produto: Produto) => {
    if (conversa.status === 'fechada') return;
    setCartUpdatingId(produto.id);
    try {
      const res = await actionAdicionarItemAoCarrinho({
        clienteId: conversa.cliente_id,
        produtoId: produto.id,
        quantidade: 1,
      });

      if (res.success && res.carrinho) {
        setCarrinho(res.carrinho);
        setSidebarTab('carrinho');
      }
    } catch (err) {
      console.error('Erro ao adicionar produto ao carrinho:', err);
    } finally {
      setCartUpdatingId(null);
    }
  };

  const handleAlterarQuantidadeItem = async (produtoId: string, novaQtd: number) => {
    setCartUpdatingId(produtoId);
    try {
      const res = await actionAtualizarQuantidadeItem({
        clienteId: conversa.cliente_id,
        produtoId,
        quantidade: novaQtd,
      });
      if (res.success && res.carrinho) {
        setCarrinho(res.carrinho);
      }
    } catch (err) {
      console.error('Erro ao alterar quantidade no carrinho:', err);
    } finally {
      setCartUpdatingId(null);
    }
  };

  const handleRemoverDoCarrinho = async (produtoId: string) => {
    setCartUpdatingId(produtoId);
    try {
      const res = await actionRemoverItemDoCarrinho({
        clienteId: conversa.cliente_id,
        produtoId,
      });
      if (res.success && res.carrinho) {
        setCarrinho(res.carrinho);
      }
    } catch (err) {
      console.error('Erro ao remover produto do carrinho:', err);
    } finally {
      setCartUpdatingId(null);
    }
  };

  const handleLimparCarrinhoCompleto = async () => {
    if (!confirm('Deseja remover todos os itens do seu pedido?')) return;
    setLoadingCarrinho(true);
    try {
      const res = await actionLimparCarrinho(conversa.cliente_id);
      if (res.success && res.carrinho) {
        setCarrinho(res.carrinho);
      }
    } catch (err) {
      console.error('Erro ao limpar carrinho:', err);
    } finally {
      setLoadingCarrinho(false);
    }
  };

  // Enviar resumo do pedido montado para o chat
  const handleEnviarPedidoParaChat = async () => {
    if (!carrinho || !carrinho.itens_carrinho || carrinho.itens_carrinho.length === 0) return;
    if (conversa.status === 'fechada') return;

    setSendingOrderSummary(true);
    setValidationError(null);

    const formatarMoeda = (centavos: number) =>
      (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Montar texto rico do pedido
    const itensTexto = carrinho.itens_carrinho
      .map(
        (it) =>
          `• ${it.quantidade}x ${it.produtos?.nome || 'Item'} (${formatarMoeda(it.preco_unitario_centavos * it.quantidade)})`
      )
      .join('\n');

    const totalTexto = formatarMoeda(carrinho.total_centavos);
    const mensagemTexto = `🛒 *Pedido Montado no Cardápio:*\n${itensTexto}\n\n💰 *Total:* ${totalTexto}\n🕒 *Horário de Retirada:* ${horarioRetirada}\n📍 *Local:* Balcão Umbará (Casa de Assados Sofia)\n\nOlá! Gostaria de confirmar esse pedido, por favor!`;

    try {
      const { data, error } = await supabase
        .from('mensagens')
        .insert({
          conversa_id: conversa.id,
          remetente: 'cliente',
          conteudo: mensagemTexto,
          url_anexo: null,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setMensagens((prev) => [...prev, data]);
        setShowMobileDrawer(false);

        // Disparar processamento Sofia / RAG
        if (conversa.ia_ativa) {
          processarIaChat(conversa.id, mensagemTexto).catch((err) => {
            console.error('Erro ao chamar a action processarIaChat:', err);
          });
        }
      }
    } catch (err: any) {
      console.error('Erro ao enviar pedido para o chat:', err);
      setValidationError('Erro ao enviar pedido para o atendimento. Tente novamente.');
    } finally {
      setSendingOrderSummary(false);
    }
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, produto: Produto) => {
    e.dataTransfer.setData('application/json', JSON.stringify(produto));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnCart = async (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const produto = JSON.parse(dataStr) as Produto;
      await handleAdicionarAoCarrinho(produto);
    } catch (err) {
      console.error('Erro ao processar drop no carrinho:', err);
    }
  };

  // File Upload Handlers
  const handleAttachmentClick = () => {
    if (conversa.status === 'fechada') return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setValidationError(null);

    try {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setValidationError('Apenas arquivos PDF são permitidos.');
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const maxSizeBytes = 5 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        setValidationError('O arquivo deve ter no máximo 5MB.');
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const arr = new Uint8Array(reader.result as ArrayBuffer);
          if (arr.length < 4 || arr[0] !== 0x25 || arr[1] !== 0x50 || arr[2] !== 0x44 || arr[3] !== 0x46) {
            setValidationError('O arquivo não é um PDF válido.');
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          const fileExt = file.name.split('.').pop();
          const sanitizedName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
          const fileName = `${Date.now()}_${sanitizedName}.${fileExt}`;
          const filePath = `${conversa.id}/${fileName}`;

          const { error } = await supabase.storage
            .from('chat-midias')
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (error) throw error;

          setAttachmentPath(filePath);
          setAttachmentName(file.name);
          setAttachmentType(file.type || 'application/pdf');
          setAttachmentSize(file.size);
        } catch (err: any) {
          console.error('Erro no upload:', err);
          setValidationError('Falha ao enviar arquivo. Tente novamente.');
        } finally {
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };

      reader.readAsArrayBuffer(file.slice(0, 4));
    } catch (err: any) {
      console.error('Erro no processamento do arquivo:', err);
      setValidationError('Falha ao processar arquivo. Tente novamente.');
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = () => {
    setAttachmentPath(null);
    setAttachmentName(null);
    setAttachmentType(null);
    setAttachmentSize(null);
  };

  // Submit manual chat message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSending || uploading) return;

    setValidationError(null);

    const messageData = {
      conteudo: inputValue.trim() || null,
      url_anexo: attachmentPath || null,
    };

    const validation = novaMensagemSchema.safeParse(messageData);
    if (!validation.success) {
      setValidationError(validation.error.issues[0].message);
      return;
    }

    setIsSending(true);

    try {
      const isPdf = attachmentType === 'application/pdf' || (attachmentName && attachmentName.toLowerCase().endsWith('.pdf'));

      if (isPdf && attachmentPath && attachmentSize) {
        await supabase.from('comprovantes').insert({
          cliente_id: conversa.cliente_id,
          url_arquivo: attachmentPath,
          nome_arquivo: attachmentName,
          tamanho_bytes: attachmentSize,
        });

        await supabase.from('conversas').update({ ia_ativa: false, status: 'aberta' }).eq('id', conversa.id);
        setConversa((prev) => ({ ...prev, ia_ativa: false, status: 'aberta' }));
      }

      const { data, error } = await supabase
        .from('mensagens')
        .insert({
          conversa_id: conversa.id,
          remetente: 'cliente',
          conteudo: messageData.conteudo,
          url_anexo: messageData.url_anexo,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setMensagens((prev) => [...prev, data]);

        if (isPdf) {
          const { data: iaMsg } = await supabase
            .from('mensagens')
            .insert({
              conversa_id: conversa.id,
              remetente: 'ia',
              conteudo: 'Recebemos seu comprovante de pagamento. Ele será analisado por um atendente humano em breve.',
              url_anexo: null,
            })
            .select()
            .single();

          if (iaMsg) {
            setMensagens((prev) => [...prev, iaMsg]);
          }
        } else if (conversa.ia_ativa && messageData.conteudo) {
          setIsIaTyping(true);
          processarIaChat(conversa.id, messageData.conteudo)
            .then(async () => {
              // Fallback sync caso o websocket sofra micro-latência
              const { data: ultimasMensagens } = await supabase
                .from('mensagens')
                .select('*')
                .eq('conversa_id', conversa.id)
                .order('data_criacao', { ascending: false })
                .limit(20);

              if (ultimasMensagens && ultimasMensagens.length > 0) {
                const ordenadas = [...ultimasMensagens].reverse();
                setMensagens((prev) => {
                  const mapa = new Map(prev.map((m) => [m.id, m]));
                  for (const m of ordenadas) {
                    mapa.set(m.id, m);
                  }
                  return Array.from(mapa.values());
                });
              }
            })
            .catch((err) => {
              console.error('Erro ao processar IA:', err);
            })
            .finally(() => {
              setIsIaTyping(false);
            });
        }
      }

      setInputValue('');
      removeAttachment();
    } catch (err: any) {
      console.error('Erro ao enviar mensagem:', err);
      setValidationError('Erro ao enviar mensagem. Por favor, tente novamente.');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const isImageFile = (url: string | null) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp') || lower.endsWith('.gif');
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatarMoeda = (centavos: number) =>
    (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const totalItensCarrinho = carrinho?.itens_carrinho?.reduce((acc, it) => acc + it.quantidade, 0) || 0;
  const isChatClosed = conversa.status === 'fechada';

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans relative">
      
      {/* 1. PAINEL PRINCIPAL DO CHAT */}
      <div className="flex-1 flex flex-col h-full bg-zinc-950/40 relative overflow-hidden">
        
        {/* CABEÇALHO DO CHAT */}
        <header className="h-16 px-6 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" showSubtitle={false} />
            <div className="h-4 w-px bg-zinc-800 hidden sm:block" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-200">Sofia • Atendimento Virtual</span>
              <span className="text-[10px] text-zinc-400">Domingo de Assados no Umbará</span>
            </div>
          </div>

          {/* Badges e Ações do Header */}
          <div className="flex items-center gap-3">
            {/* Botão de Carrinho / Pedido Ativo */}
            <button
              type="button"
              onClick={() => {
                setSidebarTab('carrinho');
                setShowMobileDrawer(true);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold transition-all cursor-pointer select-none active:scale-95 shadow-xs"
              title="Ver meu pedido personalizado"
            >
              <ShoppingCart className="h-4 w-4 text-amber-500" />
              <span>Meu Pedido</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-zinc-950 text-[10px] font-black">
                {totalItensCarrinho}
              </span>
              {carrinho && carrinho.total_centavos > 0 && (
                <span className="hidden sm:inline text-zinc-200 font-mono text-[11px] font-medium border-l border-amber-500/30 pl-2">
                  {formatarMoeda(carrinho.total_centavos)}
                </span>
              )}
            </button>

            {/* Status Indicator */}
            {isChatClosed ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
                Chat Encerrado
              </span>
            ) : conversa.ia_ativa && conversa.status === 'ia_atendendo' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Sofia (IA)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Atendente
              </span>
            )}
          </div>
        </header>

        {/* CORPO DE MENSAGENS / ÁREA DE DROP */}
        <div 
          ref={messagesContainerRef}
          data-testid="chat-dropzone"
          onDragOver={handleDragOver}
          onDrop={handleDropOnCart}
          className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
        >
          {mensagens.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="h-12 w-12 bg-amber-500/5 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-500/10">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-zinc-200 font-semibold">Olá, {clienteNome}!</h3>
              <p className="text-sm text-zinc-500 max-w-xs">
                Seja bem-vindo à Casa de Assados Sofia! Escolha seus assados no cardápio ao lado para montar seu pedido personalizado.
              </p>
            </div>
          ) : (
            mensagens.map((msg) => {
              const isCliente = msg.remetente === 'cliente';
              const isIa = msg.remetente === 'ia';
              const isOperador = msg.remetente === 'operador';
              const displayUrl = msg.url_anexo ? (signedUrls[msg.url_anexo] || msg.url_anexo) : null;
              const hasAnexo = !!msg.url_anexo;

              return (
                <div 
                  key={msg.id} 
                  className={`flex w-full ${isCliente ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                >
                  <div className={`flex gap-3 max-w-[85%] ${isCliente ? 'flex-row-reverse' : 'flex-row'}`}>
                    
                    {/* Avatar */}
                    <div className={`h-8 w-8 rounded-lg shrink-0 flex items-center justify-center border text-xs font-semibold
                      ${isCliente ? 'bg-amber-600/10 border-amber-500/20 text-amber-400' : ''}
                      ${isIa ? 'bg-red-600/10 border-red-500/20 text-red-500' : ''}
                      ${isOperador ? 'bg-blue-600/10 border-blue-500/20 text-blue-400' : ''}
                    `}>
                      {isCliente ? <User className="h-4 w-4" /> : isIa ? <Flame className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </div>

                    {/* Conteúdo do Balão */}
                    <div className="flex flex-col space-y-1">
                      <div className={`flex items-center gap-1.5 ${isCliente ? 'justify-end' : 'justify-start'}`}>
                        <span className={`text-[10px] uppercase tracking-wider font-semibold px-0.5
                          ${isCliente ? 'text-zinc-500' : ''}
                          ${isIa ? 'text-red-400' : ''}
                          ${isOperador ? 'text-blue-400' : ''}
                        `}>
                          {isCliente ? (clienteNome || 'Você') : isIa ? 'Sofia (IA)' : 'Atendente'}
                        </span>
                        
                        {msg.whatsapp_mensagem_id ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            WhatsApp
                          </span>
                        ) : msg.telegram_mensagem_id ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Telegram
                          </span>
                        ) : isCliente ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
                            Web
                          </span>
                        ) : null}
                      </div>

                      <div className={`px-4 py-3 rounded-2xl shadow-md border text-sm relative group
                        ${isCliente ? 'bg-gradient-to-r from-red-600 to-amber-600 border-red-600/20 text-white rounded-tr-none' : ''}
                        ${isIa ? 'bg-zinc-900 border-zinc-800/80 text-zinc-100 rounded-tl-none' : ''}
                        ${isOperador ? 'bg-blue-950/40 border-blue-900/40 text-blue-100 rounded-tl-none' : ''}
                      `}>
                        {msg.conteudo && (
                          <ChatMessageCardapioRenderer
                            conteudo={msg.conteudo}
                            produtos={produtos}
                            onAdicionarAoCarrinho={handleAdicionarAoCarrinho}
                            isIa={isIa}
                          />
                        )}

                        {hasAnexo && displayUrl && (
                          <div className={`mt-2 ${msg.conteudo ? 'pt-2 border-t' : ''} 
                            ${isCliente ? 'border-red-500/30' : isIa ? 'border-zinc-800' : 'border-blue-900/30'}
                          `}>
                            {isImageFile(msg.url_anexo) ? (
                              <div className="relative rounded-lg overflow-hidden border border-black/10 max-w-full">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img 
                                  src={displayUrl} 
                                  alt="Anexo do chat" 
                                  className="max-h-60 object-contain hover:scale-[1.01] transition-transform duration-200 bg-black/20"
                                />
                              </div>
                            ) : (
                              <a 
                                href={displayUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-colors
                                  ${isCliente 
                                    ? 'bg-red-700/30 hover:bg-red-700/50 border-red-500/30 text-white' 
                                    : isIa 
                                      ? 'bg-zinc-950 hover:bg-zinc-950/60 border-zinc-800 text-zinc-300'
                                      : 'bg-blue-950 hover:bg-blue-900/50 border-blue-900/40 text-blue-200'
                                  }
                                `}
                              >
                                <FileText className="h-4 w-4 shrink-0" />
                                <span className="truncate max-w-[150px]">{msg.url_anexo?.split('/').pop() || 'Ver arquivo'}</span>
                                <Download className="h-3.5 w-3.5 ml-auto text-zinc-400 hover:text-white" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      <span className={`text-[10px] text-zinc-600 ${isCliente ? 'text-right' : 'text-left'}`}>
                        {formatTime(msg.data_criacao)}
                      </span>
                    </div>

                  </div>
                </div>
              );
            })
          )}

          {/* Indicador de Digitação da Sofia */}
          {isIaTyping && (
            <div className="flex w-full justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex gap-3 max-w-[85%] flex-row items-center">
                <div className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center border text-xs font-semibold bg-red-600/10 border-red-500/20 text-red-500">
                  <Flame className="h-4 w-4 animate-pulse" />
                </div>
                <div className="flex flex-col space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-0.5 text-red-400">
                    Sofia (IA)
                  </span>
                  <div className="px-4 py-3 rounded-2xl shadow-md border text-sm bg-zinc-900 border-zinc-800/80 text-zinc-300 rounded-tl-none flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Digitando</span>
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RODAPÉ E CAMPO DE MENSAGEM */}
        <footer className="p-4 border-t border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky bottom-0 z-20">
          
          {validationError && (
            <div className="mb-3 p-3 bg-red-600/10 border border-red-500/20 text-red-400 text-xs rounded-xl font-medium flex items-center justify-between">
              <span>{validationError}</span>
              <button onClick={() => setValidationError(null)} className="text-zinc-400 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {attachmentName && (
            <div className="mb-3 p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-2 text-xs text-zinc-300 font-medium truncate">
                {attachmentType?.startsWith('image/') ? (
                  <ImageIcon className="h-4 w-4 text-amber-500 shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-amber-500 shrink-0" />
                )}
                <span className="truncate max-w-[200px]">{attachmentName}</span>
              </div>
              <button 
                type="button" 
                onClick={removeAttachment}
                className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {isChatClosed && (
            <div className="mb-3 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs rounded-xl font-medium">
              Esta conversa foi encerrada. Se precisar de ajuda, inicie um novo atendimento.
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="application/pdf"
            />

            <button
              type="button"
              disabled={isChatClosed || uploading}
              onClick={handleAttachmentClick}
              className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-zinc-700 text-zinc-400 hover:text-amber-500 transition-all cursor-pointer flex items-center justify-center shrink-0 h-[46px] w-[46px] disabled:opacity-50 disabled:cursor-not-allowed"
              title="Anexar arquivo"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </button>

            <div className="flex-1 bg-zinc-900/40 border border-zinc-800/80 focus-within:border-amber-500/50 focus-within:ring-2 focus-within:ring-amber-500/10 rounded-2xl overflow-hidden transition-all flex items-end">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isChatClosed}
                placeholder={isChatClosed ? "Este chat foi encerrado." : "Digite sua mensagem..."}
                className="flex-1 max-h-40 min-h-[46px] py-3.5 px-4 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-hidden resize-none scrollbar-none font-medium leading-relaxed disabled:cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              disabled={isChatClosed || isSending || uploading}
              className="p-3 rounded-xl bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white shadow-md shadow-red-600/15 hover:shadow-red-600/25 active:scale-[0.97] transition-all cursor-pointer flex items-center justify-center shrink-0 h-[46px] w-[46px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        </footer>
      </div>

      {/* 2. ÁREA LATERAL (DESKTOP): CARDÁPIO E CARRINHO PERSONALIZADO */}
      <aside 
        onDragOver={handleDragOver}
        onDrop={handleDropOnCart}
        className="w-80 md:w-96 border-l border-zinc-900 bg-zinc-950/95 flex flex-col h-full hidden lg:flex shrink-0 z-10"
      >
        {/* Abas Superiores */}
        <div className="p-3 border-b border-zinc-900 bg-zinc-900/40 flex gap-2">
          <button
            type="button"
            onClick={() => setSidebarTab('cardapio')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              sidebarTab === 'cardapio'
                ? 'bg-amber-500 text-zinc-950 shadow-sm'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Cardápio</span>
          </button>

          <button
            type="button"
            onClick={() => setSidebarTab('carrinho')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              sidebarTab === 'carrinho'
                ? 'bg-amber-500 text-zinc-950 shadow-sm'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>Meu Pedido ({totalItensCarrinho})</span>
          </button>
        </div>

        {/* Conteúdo da Aba Selecionada */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {sidebarTab === 'cardapio' ? (
            /* Lista do Cardápio */
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-zinc-900">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Catálogo de Produtos • Assados de Domingo</span>
                <span className="text-[10px] text-amber-500 font-medium">Clique ou arraste para pedir</span>
              </div>

              {produtos.map((produto) => {
                const isAdding = cartUpdatingId === produto.id;

                return (
                  <div
                    key={produto.id}
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, produto)}
                    className="p-3 rounded-2xl border border-zinc-900 bg-zinc-900/30 hover:bg-zinc-900/60 hover:border-zinc-800 transition-all flex flex-col gap-2.5 group cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex gap-3">
                      {produto.url_imagem_thumb || produto.url_imagem ? (
                        <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0">
                          <Image
                            src={produto.url_imagem_thumb || produto.url_imagem || ''}
                            alt={produto.nome}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-200"
                            sizes="56px"
                          />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 shrink-0">
                          <Utensils className="h-6 w-6" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-zinc-200 truncate">{produto.nome}</h4>
                        <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5 leading-relaxed">
                          {produto.descricao || 'Assado tradicional'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-900/80">
                      <span className="text-xs font-extrabold text-amber-400 font-mono">
                        {formatarMoeda(produto.preco_centavos)}
                      </span>

                      <button
                        type="button"
                        disabled={isAdding}
                        onClick={() => handleAdicionarAoCarrinho(produto)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer select-none active:scale-95 disabled:opacity-50"
                      >
                        {isAdding ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3 stroke-[3]" />
                        )}
                        <span>Adicionar</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Painel de Pedido / Carrinho Ativo */
            <div className="space-y-4">
              {loadingCarrinho && !carrinho ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-500 mb-2" />
                  <p className="text-xs">Atualizando seu pedido...</p>
                </div>
              ) : !carrinho || !carrinho.itens_carrinho || carrinho.itens_carrinho.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center text-zinc-500 space-y-2">
                  <ShoppingCart className="h-10 w-10 stroke-zinc-700 mb-1" />
                  <p className="text-xs font-bold text-zinc-300">Seu pedido está vazio</p>
                  <p className="text-[11px] text-zinc-500 max-w-[200px]">
                    Navegue pela aba &quot;Cardápio&quot; e adicione os assados que deseja para seu domingo.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSidebarTab('cardapio')}
                    className="mt-2 text-xs font-bold text-amber-400 hover:underline cursor-pointer"
                  >
                    Ver Cardápio &rarr;
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Lista de Itens */}
                  <div className="space-y-2.5">
                    {carrinho.itens_carrinho.map((item) => {
                      const prod = item.produtos;
                      const isUpdating = cartUpdatingId === item.produto_id;

                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 p-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40"
                        >
                          <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700/40">
                            {prod?.url_imagem ? (
                              <Image
                                src={prod.url_imagem}
                                alt={prod.nome || 'Produto'}
                                fill
                                className="object-cover"
                                sizes="44px"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-zinc-600">
                                <Utensils className="h-4 w-4" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-semibold text-zinc-200 truncate">{prod?.nome}</h4>
                            <span className="text-[11px] text-amber-400 font-mono font-medium">
                              {formatarMoeda(item.preco_unitario_centavos * item.quantidade)}
                            </span>
                          </div>

                          {/* Controles de Quantidade */}
                          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1">
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleAlterarQuantidadeItem(item.produto_id, item.quantidade - 1)}
                              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                            >
                              <Minus className="h-3 w-3" />
                            </button>

                            <span className="w-5 text-center text-xs font-bold text-zinc-100">
                              {item.quantidade}
                            </span>

                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleAlterarQuantidadeItem(item.produto_id, item.quantidade + 1)}
                              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>

                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleRemoverDoCarrinho(item.produto_id)}
                            className="p-1 text-zinc-500 hover:text-red-400 cursor-pointer"
                            title="Remover item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Detalhes de Retirada e Total */}
                  <div className="p-3.5 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        <span>Horário Desejado para Retirada:</span>
                      </label>
                      <select
                        value={horarioRetirada}
                        onChange={(e) => setHorarioRetirada(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                      >
                        {HORARIOS_RETIRADA.map((h) => (
                          <option key={h} value={h}>
                            {h} (Balcão Umbará)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                      <span className="text-zinc-400 font-medium">Total do Pedido:</span>
                      <span className="text-base font-black text-amber-400 font-mono">
                        {formatarMoeda(carrinho.total_centavos)}
                      </span>
                    </div>

                    {/* Botão de Envio para o Atendimento */}
                    <button
                      type="button"
                      disabled={sendingOrderSummary || isChatClosed}
                      onClick={handleEnviarPedidoParaChat}
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 rounded-xl text-xs font-black shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 disabled:opacity-50 select-none"
                    >
                      {sendingOrderSummary ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Enviando pedido...</span>
                        </>
                      ) : (
                        <>
                          <PackageCheck className="h-4 w-4" />
                          <span>Enviar Pedido para Atendente</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleLimparCarrinhoCompleto}
                      className="w-full text-center text-[10px] text-zinc-500 hover:text-red-400 transition-colors py-1 cursor-pointer"
                    >
                      Limpar todo o pedido
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* 3. MODAL / GAVETA MOBILE (Telas menores) */}
      {showMobileDrawer && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-zinc-950 border-t border-zinc-900 rounded-t-3xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            {/* Header Mobile Drawer */}
            <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSidebarTab('cardapio')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold ${
                    sidebarTab === 'cardapio' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400'
                  }`}
                >
                  Cardápio
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('carrinho')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold ${
                    sidebarTab === 'carrinho' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400'
                  }`}
                >
                  Meu Pedido ({totalItensCarrinho})
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowMobileDrawer(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Conteúdo Mobile */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {sidebarTab === 'cardapio' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {produtos.map((produto) => (
                    <div
                      key={produto.id}
                      className="p-3 rounded-xl border border-zinc-900 bg-zinc-900/40 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                          {produto.url_imagem_thumb || produto.url_imagem ? (
                            <Image
                              src={produto.url_imagem_thumb || produto.url_imagem || ''}
                              alt={produto.nome}
                              fill
                              className="object-cover"
                              sizes="48px"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-zinc-600">
                              <Utensils className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-zinc-200 truncate">{produto.nome}</h4>
                          <span className="text-xs font-bold text-amber-400 font-mono">
                            {formatarMoeda(produto.preco_centavos)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAdicionarAoCarrinho(produto)}
                        className="px-2.5 py-1.5 bg-amber-500 text-zinc-950 rounded-lg text-xs font-bold shrink-0"
                      >
                        + Pedir
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {!carrinho || !carrinho.itens_carrinho || carrinho.itens_carrinho.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500">
                      <p className="text-xs">Nenhum item adicionado ao seu pedido.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {carrinho.itens_carrinho.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/40"
                        >
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-semibold text-zinc-200 truncate">{item.produtos?.nome}</h4>
                            <span className="text-xs text-amber-400 font-mono">
                              {formatarMoeda(item.preco_unitario_centavos * item.quantidade)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleAlterarQuantidadeItem(item.produto_id, item.quantidade - 1)}
                              className="p-1 rounded bg-zinc-800 text-zinc-300"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="text-xs font-bold">{item.quantidade}</span>
                            <button
                              type="button"
                              onClick={() => handleAlterarQuantidadeItem(item.produto_id, item.quantidade + 1)}
                              className="p-1 rounded bg-zinc-800 text-zinc-300"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-400">Total:</span>
                          <span className="text-sm font-bold text-amber-400 font-mono">
                            {formatarMoeda(carrinho.total_centavos)}
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={sendingOrderSummary}
                          onClick={handleEnviarPedidoParaChat}
                          className="w-full py-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl text-xs mt-2"
                        >
                          {sendingOrderSummary ? 'Enviando...' : 'Enviar Pedido para Atendente'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
