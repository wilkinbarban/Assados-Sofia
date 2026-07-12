'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Download 
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { novaMensagemSchema } from '@/lib/validation/chat';
import { processarIaChat } from '@/app/actions/chat';

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

export default function ChatContainer({
  clienteNome,
  conversaInicial,
  mensagensIniciais,
  produtos = [],
}: ChatContainerProps) {
  const supabase = useMemo(() => createClient(), []);
  const [conversa, setConversa] = useState<Conversa>(conversaInicial);
  const [mensagens, setMensagens] = useState<Mensagem[]>(mensagensIniciais);
  
  // Input & Upload States
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentType, setAttachmentType] = useState<string | null>(null);
  const [attachmentSize, setAttachmentSize] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [showMobileCatalog, setShowMobileCatalog] = useState(false);

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
            // Avoid duplicate messages
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

  // Handle file attachment selection and upload
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
      // Restrict file selection to PDF only
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setValidationError('Apenas arquivos PDF são permitidos.');
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Enforce file size limit <= 5MB
      const maxSizeBytes = 5 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        setValidationError('O arquivo deve ter no máximo 5MB.');
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Read first 4 bytes with FileReader (ArrayBuffer) to check %PDF magic bytes
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const arr = new Uint8Array(reader.result as ArrayBuffer);
          // magic bytes for %PDF: [0x25, 0x50, 0x44, 0x46]
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

          // Upload to private Supabase bucket 'chat-midias'
          const { error } = await supabase.storage
            .from('chat-midias')
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (error) {
            throw error;
          }

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

  // Submit message handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSending || uploading) return;

    setValidationError(null);

    const messageData = {
      conteudo: inputValue.trim() || null,
      url_anexo: attachmentPath || null,
    };

    // Zod validation enforce
    const validation = novaMensagemSchema.safeParse(messageData);
    if (!validation.success) {
      setValidationError(validation.error.issues[0].message);
      return;
    }

    setIsSending(true);

    try {
      const isPdf = attachmentType === 'application/pdf' || (attachmentName && attachmentName.toLowerCase().endsWith('.pdf'));

      // If PDF, insert comprovantes record before inserting client's message
      if (isPdf && attachmentPath && attachmentSize) {
        const { error: compError } = await supabase
          .from('comprovantes')
          .insert({
            cliente_id: conversa.cliente_id,
            url_arquivo: attachmentPath,
            nome_arquivo: attachmentName,
            tamanho_bytes: attachmentSize,
          });

        if (compError) {
          throw compError;
        }

        // Set conversa: ia_ativa = false and status = 'aberta' in database
        const { error: convError } = await supabase
          .from('conversas')
          .update({
            ia_ativa: false,
            status: 'aberta',
          })
          .eq('id', conversa.id);

        if (convError) {
          throw convError;
        }

        // Update local React state
        setConversa(prev => ({ ...prev, ia_ativa: false, status: 'aberta' }));
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

      if (error) {
        throw error;
      }

      // Optimistic or database response update
      if (data) {
        setMensagens((prev) => [...prev, data]);

        if (isPdf) {
          // Insert automated reply message from 'ia' stating that the PDF was received and will be reviewed by a human
          const autoReplyContent = 'Recebemos seu comprovante de pagamento. Ele será analisado por um atendente humano em breve.';
          const { data: autoData, error: autoError } = await supabase
            .from('mensagens')
            .insert({
              conversa_id: conversa.id,
              remetente: 'ia',
              conteudo: autoReplyContent,
              url_anexo: null,
            })
            .select()
            .single();

          if (autoError) {
            throw autoError;
          }
          if (autoData) {
            setMensagens((prev) => [...prev, autoData]);
          }
        } else {
          // Disparar o processamento da IA de forma assíncrona (sem dar await) apenas se NÃO for PDF
          if (messageData.conteudo) {
            processarIaChat(conversa.id, messageData.conteudo).catch((err) => {
              console.error('Erro ao chamar a action processarIaChat:', err);
            });
          }
        }
      }

      // Reset states
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

  const handleDragStart = (e: React.DragEvent, produto: Produto) => {
    e.dataTransfer.setData('application/json', JSON.stringify(produto));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const produto = JSON.parse(dataStr) as Produto;
      await enviarMensagemProduto(produto);
    } catch (err) {
      console.error('Erro ao processar drop de produto:', err);
    }
  };

  const handleProductClick = async (produto: Produto) => {
    await enviarMensagemProduto(produto);
    setShowMobileCatalog(false);
  };

  const enviarMensagemProduto = async (produto: Produto) => {
    if (conversa.status === 'fechada') return;

    const textoMensagem = `Quero adicionar ${produto.nome} ao meu pedido`;
    setValidationError(null);
    setIsSending(true);

    try {
      const { data, error } = await supabase
        .from('mensagens')
        .insert({
          conversa_id: conversa.id,
          remetente: 'cliente',
          conteudo: textoMensagem,
          url_anexo: null,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        setMensagens((prev) => [...prev, data]);
        // Disparar o processamento da IA de forma assíncrona
        processarIaChat(conversa.id, textoMensagem).catch((err) => {
          console.error('Erro ao chamar a action processarIaChat:', err);
        });
      }
    } catch (err: any) {
      console.error('Erro ao adicionar produto no chat:', err);
      setValidationError('Erro ao enviar mensagem do produto. Por favor, tente novamente.');
    } finally {
      setIsSending(false);
    }
  };

  const isChatClosed = conversa.status === 'fechada';

  // Helper to format date
  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Check if an attachment path is an image
  const isImageFile = (path: string | null) => {
    if (!path) return false;
    const lower = path.toLowerCase();
    return lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.webp');
  };

  return (
    <div className="flex flex-row h-full w-full max-w-6xl mx-auto border-x border-zinc-900 bg-zinc-950/80 backdrop-blur-xl overflow-hidden relative">
      
      {/* 1. CHAT AREA */}
      <div 
        data-testid="chat-dropzone"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="flex flex-col flex-1 h-full relative border-r border-zinc-900"
      >
        
        {/* CABEÇALHO (Header) */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-900 bg-zinc-950/90 sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center shadow-lg shadow-red-500/10">
              <Flame className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Atendimento Sofía</h2>
              <p className="text-xs text-zinc-400">Asados Sofía Churrascaria</p>
            </div>
          </div>

          {/* Status Indicator Badges */}
          <div className="flex items-center gap-3">
            {/* Catalog Toggle Button for Mobile */}
            <button
              type="button"
              onClick={() => setShowMobileCatalog(!showMobileCatalog)}
              className="md:hidden p-2 rounded-xl border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-amber-500 transition-all flex items-center justify-center"
              title="Ver catálogo"
            >
              <Sparkles className="h-4 w-4" />
            </button>

            {conversa.status === 'fechada' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
                Chat Encerrado
              </span>
            ) : conversa.ia_ativa && conversa.status === 'ia_atendendo' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Sofia (IA)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                Atendente Humano
              </span>
            )}
          </div>
        </header>

        {/* CORPO DE MENSAGENS (Body) */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
        >
          {mensagens.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="h-12 w-12 bg-amber-500/5 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-500/10">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-zinc-200 font-semibold">Olá, {clienteNome}!</h3>
              <p className="text-sm text-zinc-500 max-w-xs">
                Como podemos ajudar você hoje? Digite sua mensagem abaixo para iniciar a conversa com a nossa assistente Sofía.
              </p>
            </div>
          ) : (
            mensagens.map((msg) => {
              const isCliente = msg.remetente === 'cliente';
              const isIa = msg.remetente === 'ia';
              const isOperador = msg.remetente === 'operador';
              
              // Resolve private attachment URL if exists
              const displayUrl = msg.url_anexo ? (signedUrls[msg.url_anexo] || msg.url_anexo) : null;
              const hasAnexo = !!msg.url_anexo;

              return (
                <div 
                  key={msg.id} 
                  className={`flex w-full ${isCliente ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                >
                  <div className={`flex gap-3 max-w-[80%] ${isCliente ? 'flex-row-reverse' : 'flex-row'}`}>
                    
                    {/* Sender Avatar */}
                    <div className={`h-8 w-8 rounded-lg shrink-0 flex items-center justify-center border text-xs font-semibold
                      ${isCliente ? 'bg-amber-600/10 border-amber-500/20 text-amber-400' : ''}
                      ${isIa ? 'bg-red-600/10 border-red-500/20 text-red-500' : ''}
                      ${isOperador ? 'bg-blue-600/10 border-blue-500/20 text-blue-400' : ''}
                    `}>
                      {isCliente ? <User className="h-4 w-4" /> : isIa ? <Flame className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </div>

                    {/* Message Bubble Container */}
                    <div className="flex flex-col space-y-1">
                      
                      {/* Sender Tag & Channel Badge */}
                      <div className={`flex items-center gap-1.5 ${isCliente ? 'justify-end' : 'justify-start'}`}>
                        <span className={`text-[10px] uppercase tracking-wider font-semibold px-0.5
                          ${isCliente ? 'text-zinc-500' : ''}
                          ${isIa ? 'text-red-400' : ''}
                          ${isOperador ? 'text-blue-400' : ''}
                        `}>
                          {isCliente ? (clienteNome || 'Você') : isIa ? 'Sofia (IA)' : 'Atendente'}
                        </span>
                        
                        {/* Channel Badge */}
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

                      {/* Bubble Content */}
                      <div className={`px-4 py-3 rounded-2xl shadow-md border text-sm relative group
                        ${isCliente ? 'bg-gradient-to-r from-red-600 to-amber-600 border-red-600/20 text-white rounded-tr-none' : ''}
                        ${isIa ? 'bg-zinc-900 border-zinc-800/80 text-zinc-100 rounded-tl-none' : ''}
                        ${isOperador ? 'bg-blue-950/40 border-blue-900/40 text-blue-100 rounded-tl-none' : ''}
                      `}>
                        
                        {/* Text */}
                        {msg.conteudo && (
                          <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.conteudo}</p>
                        )}

                        {/* Attachment Rendering */}
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

                      {/* Timestamp */}
                      <span className={`text-[10px] text-zinc-600 ${isCliente ? 'text-right' : 'text-left'}`}>
                        {formatTime(msg.data_criacao)}
                      </span>
                    </div>

                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 3. RODAPÉ DE INSERÇÃO (Footer & Input) */}
        <footer className="p-4 border-t border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky bottom-0 z-20">
          
          {/* Validation or API Error Alerts */}
          {validationError && (
            <div className="mb-3 p-3 bg-red-600/10 border border-red-500/20 text-red-400 text-xs rounded-xl font-medium flex items-center justify-between">
              <span>{validationError}</span>
              <button onClick={() => setValidationError(null)} className="text-zinc-400 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Attachment Upload State Card */}
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

          {/* Caixa informativa destacada amarela se a conversa for fechada */}
          {isChatClosed && (
            <div className="mb-3 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs rounded-xl font-medium">
              Esta conversa foi encerrada. Se precisar de ajuda, inicie um novo atendimento.
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
            
            {/* File Input */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="application/pdf"
            />

            {/* Attachment Button */}
            <button
              type="button"
              disabled={isChatClosed || uploading}
              onClick={handleAttachmentClick}
              className={`p-3 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-zinc-700 text-zinc-400 hover:text-amber-500 transition-all cursor-pointer flex items-center justify-center shrink-0 h-[46px] w-[46px] disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Anexar arquivo"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </button>

            {/* Chat text input container */}
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

            {/* Send Button */}
            <button
              type="submit"
              disabled={isChatClosed || isSending || uploading}
              className={`p-3 rounded-xl bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white shadow-md shadow-red-600/15 hover:shadow-red-600/25 active:scale-[0.97] transition-all cursor-pointer flex items-center justify-center shrink-0 h-[46px] w-[46px] disabled:opacity-50 disabled:cursor-not-allowed`}
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

      {/* 2. CATALOG SIDEBAR (DESKTOP) */}
      <aside className="w-80 border-l border-zinc-900 bg-zinc-950/95 flex flex-col h-full hidden md:flex shrink-0">
        <div className="p-4 border-b border-zinc-900 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-100">Catálogo de Produtos</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {produtos && produtos.length > 0 ? (
            <ul className="space-y-3" role="list">
              {produtos.map((produto) => (
                <li 
                  key={produto.id} 
                  draggable="true"
                  onDragStart={(e) => handleDragStart(e, produto)}
                  onClick={() => handleProductClick(produto)}
                  className="p-3 rounded-xl border border-zinc-900 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-zinc-800 transition-all cursor-grab active:cursor-grabbing flex flex-col gap-2 cursor-pointer"
                >
                  <div className="flex gap-3">
                    {produto.url_imagem_thumb || produto.url_imagem ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img 
                        src={produto.url_imagem_thumb || produto.url_imagem || ''} 
                        alt={produto.nome}
                        className="w-12 h-12 rounded-lg object-cover bg-zinc-900 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-semibold text-zinc-200 truncate">{produto.nome}</h4>
                      <p className="text-[10px] text-zinc-500 line-clamp-2 mt-0.5 leading-relaxed">{produto.descricao || 'Sem descrição'}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-zinc-900/60">
                    <span className="text-xs font-bold text-amber-500">
                      {(produto.preco_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-zinc-600 bg-zinc-950 px-1.5 py-0.5 rounded-md border border-zinc-900">
                      Arrastar
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-500 space-y-2">
              <p className="text-xs">Nenhum produto disponível no momento.</p>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Catalog Retractable Panel */}
      {showMobileCatalog && (
        <div className="md:hidden absolute inset-0 z-30 bg-black/60 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-zinc-950 border-t border-zinc-900 rounded-t-3xl max-h-[70vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-zinc-100">Catálogo de Produtos</h3>
              </div>
              <button 
                type="button"
                onClick={() => setShowMobileCatalog(false)}
                className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {produtos && produtos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {produtos.map((produto) => (
                    <div 
                      key={produto.id}
                      onClick={() => handleProductClick(produto)}
                      className="p-3 rounded-xl border border-zinc-900 bg-zinc-900/20 flex flex-col gap-2 cursor-pointer hover:bg-zinc-900/40 hover:border-zinc-800 transition-all"
                    >
                      <div className="flex gap-3">
                        {produto.url_imagem_thumb || produto.url_imagem ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img 
                            src={produto.url_imagem_thumb || produto.url_imagem || ''} 
                            alt={produto.nome}
                            className="w-12 h-12 rounded-lg object-cover bg-zinc-900 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-semibold text-zinc-200 truncate">{produto.nome}</h4>
                          <p className="text-[10px] text-zinc-500 line-clamp-2 mt-0.5 leading-relaxed">{produto.descricao || 'Sem descrição'}</p>
                        </div>
                      </div>
                      <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-zinc-900/60">
                        <span className="text-xs font-bold text-amber-500">
                          {(produto.preco_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-800">
                          Selecionar
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500">
                  <p className="text-xs">Nenhum produto disponível no momento.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
