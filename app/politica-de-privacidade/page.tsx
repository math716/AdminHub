import type { Metadata } from 'next';
import Link from 'next/link';
import { PaginaLegal, Secao, Lista, Destaque } from '@/components/legal/pagina-legal';

export const metadata: Metadata = {
  title: 'Política de Privacidade — AdminHub',
  description: 'Como o AdminHub trata os dados dos gabinetes parlamentares e a integração com o Google Agenda.',
};

// Página pública. O Google exige acesso SEM login para verificar o OAuth, e o
// conteúdo precisa descrever exatamente o que o app faz com os dados da conta
// — descrição genérica costuma ser reprovada na triagem.
export default function PoliticaDePrivacidade() {
  return (
    <PaginaLegal titulo="Política de Privacidade" atualizadoEm="22 de agosto de 2026">
      <Secao titulo="1. Quem somos">
        <p>
          O AdminHub é uma plataforma de gestão para gabinetes parlamentares brasileiros. Reúne, num
          só lugar, o atendimento de demandas da população, a agenda de compromissos, a base de
          contatos e a consulta a dados públicos de eleições e emendas parlamentares.
        </p>
        <p>
          Esta política explica quais dados tratamos, para quê, por quanto tempo e como você pode
          exercer seus direitos. Ela se aplica a todos os usuários da plataforma.
        </p>
      </Secao>

      <Secao titulo="2. Dados que tratamos">
        <p><strong>Dados de conta.</strong> Nome, e-mail institucional, senha (armazenada de forma
          criptografada), papel no gabinete e o gabinete ao qual você pertence.</p>
        <p><strong>Dados inseridos pelo gabinete.</strong> Demandas e atendimentos, compromissos da
          agenda, contatos e lideranças, e registros de colaboradores. Esses dados pertencem ao
          gabinete que os cadastrou.</p>
        <p><strong>Dados públicos.</strong> Resultados eleitorais do Tribunal Superior Eleitoral e
          emendas parlamentares dos portais de transparência federal e estaduais. São informações
          públicas, obtidas de fontes oficiais, e não identificam usuários da plataforma.</p>
        <p><strong>Dados de uso.</strong> Registros técnicos de acesso e de consumo da assistente
          virtual, usados para segurança e controle de custos.</p>
      </Secao>

      <Secao titulo="3. Integração com o Google Agenda">
        <p>
          A conexão com o Google Agenda é <strong>opcional</strong> e só ocorre quando o chefe de
          gabinete ou administrador autoriza expressamente, pela tela de consentimento do próprio
          Google.
        </p>

        <Destaque>
          <p><strong>O acesso é somente leitura.</strong> O AdminHub utiliza exclusivamente o escopo
            <code style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--tint-08)', margin: '0 3px' }}>
              calendar.readonly
            </code>
            e <strong>nunca cria, altera ou exclui</strong> qualquer evento na sua agenda do Google.
          </p>
        </Destaque>

        <p className="pt-1"><strong>O que acessamos e por quê:</strong></p>
        <Lista itens={[
          <><strong>Eventos do calendário</strong> (título, descrição, data, horário e local) — para
            exibi-los no módulo Agenda, de modo que toda a equipe do gabinete veja os mesmos
            compromissos do parlamentar.</>,
          <><strong>Endereço de e-mail da conta</strong> — apenas para mostrar na tela qual conta
            Google está conectada, permitindo identificar e revogar a conexão.</>,
        ]} />

        <p className="pt-1"><strong>O que guardamos:</strong> uma cópia dos eventos importados, para
          que a agenda funcione sem depender de consulta constante ao Google, e as credenciais de
          acesso necessárias para manter a sincronização. As credenciais ficam restritas ao gabinete
          que autorizou.</p>

        <p><strong>O que não fazemos:</strong> não compartilhamos os dados da sua agenda com outros
          gabinetes, não os vendemos, não os usamos para publicidade e não os utilizamos para treinar
          modelos de inteligência artificial.</p>

        <p><strong>Como revogar:</strong> a qualquer momento, use o botão <em>Desconectar</em> na
          tela da Agenda, ou remova o acesso do AdminHub em{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--brand-cobalt-text)' }}>myaccount.google.com/permissions</a>.
          Ao desconectar, as credenciais são apagadas e a sincronização cessa imediatamente.
        </p>

        <p>
          O uso das informações recebidas das APIs do Google obedece à{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-cobalt-text)' }}>
            Política de Dados do Usuário dos Serviços de API do Google
          </a>, incluindo os requisitos de Uso Limitado.
        </p>
      </Secao>

      <Secao titulo="4. Isolamento entre gabinetes">
        <p>
          Cada gabinete acessa exclusivamente os próprios dados. Demandas, agenda, contatos e
          conexões com o Google são segregados por gabinete em todas as consultas do sistema. Um
          usuário de um gabinete não tem acesso, nem visualização, aos dados de outro.
        </p>
      </Secao>

      <Secao titulo="5. Com quem compartilhamos">
        <p>Não vendemos nem cedemos dados pessoais. Utilizamos apenas fornecedores necessários à
          operação da plataforma:</p>
        <Lista itens={[
          <><strong>Vercel</strong> — hospedagem da aplicação.</>,
          <><strong>Supabase</strong> — banco de dados.</>,
          <><strong>Anthropic</strong> — processamento das perguntas feitas à assistente virtual. O
            conteúdo enviado não é utilizado para treinar modelos.</>,
          <><strong>Google</strong> — exclusivamente quando a integração com o Google Agenda é
            ativada pelo gabinete.</>,
        ]} />
        <p>Também podemos divulgar informações quando houver obrigação legal ou ordem judicial.</p>
      </Secao>

      <Secao titulo="6. Por quanto tempo guardamos">
        <p>
          Os dados permanecem enquanto a conta do gabinete estiver ativa. Encerrado o contrato, são
          excluídos ou anonimizados em até 90 dias, ressalvadas as hipóteses de guarda obrigatória
          previstas em lei. Eventos da agenda já vencidos são removidos automaticamente pelo sistema.
        </p>
      </Secao>

      <Secao titulo="7. Segurança">
        <p>
          As conexões trafegam por HTTPS, as senhas são armazenadas com criptografia irreversível e o
          acesso é controlado por papéis — apenas o chefe de gabinete e administradores podem conectar
          ou desconectar a agenda. Nenhum sistema é imune a incidentes; se ocorrer algum que envolva
          risco relevante, comunicaremos os afetados e a autoridade competente.
        </p>
      </Secao>

      <Secao titulo="8. Seus direitos (LGPD)">
        <p>
          Nos termos da Lei nº 13.709/2018, você pode solicitar confirmação de tratamento, acesso,
          correção, anonimização, portabilidade ou eliminação dos seus dados, além de revogar
          consentimentos. Basta escrever para o contato indicado abaixo.
        </p>
      </Secao>

      <Secao titulo="9. Alterações">
        <p>
          Podemos atualizar esta política. Mudanças relevantes serão comunicadas na própria
          plataforma, e a data de atualização no topo desta página é sempre a da versão vigente.
        </p>
      </Secao>

      <Secao titulo="10. Contato">
        <p>
          Dúvidas sobre privacidade ou solicitações relativas aos seus dados:{' '}
          <a href="mailto:contato@adminhub.com.br" style={{ color: 'var(--brand-cobalt-text)' }}>
            contato@adminhub.com.br
          </a>.
        </p>
        <p className="pt-2" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          Veja também os <Link href="/termos-de-uso" style={{ color: 'var(--brand-cobalt-text)' }}>Termos de Uso</Link>.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
