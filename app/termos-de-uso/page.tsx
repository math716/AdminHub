import type { Metadata } from 'next';
import Link from 'next/link';
import { PaginaLegal, Secao, Lista } from '@/components/legal/pagina-legal';

export const metadata: Metadata = {
  title: 'Termos de Uso — AdminHub',
  description: 'Condições de uso da plataforma AdminHub para gabinetes parlamentares.',
};

export default function TermosDeUso() {
  return (
    <PaginaLegal titulo="Termos de Uso" atualizadoEm="22 de agosto de 2026">
      <Secao titulo="1. Objeto">
        <p>
          Estes termos regem o uso do AdminHub, plataforma de gestão para gabinetes parlamentares que
          reúne atendimento de demandas, agenda de compromissos, base de contatos e consulta a dados
          públicos de eleições e emendas parlamentares.
        </p>
        <p>Ao acessar a plataforma, você concorda com estas condições.</p>
      </Secao>

      <Secao titulo="2. Cadastro e acesso">
        <p>
          O acesso é feito por conta individual, vinculada a um gabinete. As credenciais são pessoais
          e intransferíveis: você é responsável por mantê-las em sigilo e por tudo que for feito com
          elas.
        </p>
        <p>
          Cada usuário tem um papel (administrador, agente político, chefe de gabinete ou assessor),
          que define o que pode acessar e executar. Contas podem ser suspensas em caso de uso indevido.
        </p>
      </Secao>

      <Secao titulo="3. Dados do gabinete">
        <p>
          As informações cadastradas — demandas, compromissos, contatos e colaboradores —
          <strong> pertencem ao gabinete</strong>. Atuamos apenas como operadores, tratando esses
          dados para prestar o serviço.
        </p>
        <p>
          O gabinete é responsável pela exatidão do que insere e por ter base legal para tratar dados
          de terceiros que cadastrar, sobretudo dados de cidadãos atendidos.
        </p>
      </Secao>

      <Secao titulo="4. Dados públicos e limites de precisão">
        <p>
          Resultados eleitorais vêm do Tribunal Superior Eleitoral; emendas parlamentares, dos portais
          de transparência federal e estaduais. São dados públicos, reproduzidos como divulgados pelas
          fontes oficiais.
        </p>
        <p>
          Alguns números são <strong>estimativas</strong>, não medições. A distribuição de votos por
          bairro ou por região administrativa, por exemplo, é calculada a partir dos locais de votação
          de cada zona eleitoral — o dado oficial vai até a zona, não até o bairro. Para fins
          oficiais, consulte sempre a fonte primária.
        </p>
      </Secao>

      <Secao titulo="5. Assistente virtual">
        <p>
          A Gabi consulta as bases da plataforma e apresenta análises a partir delas. As
          interpretações e recomendações são apoio à decisão, não aconselhamento jurídico, contábil ou
          eleitoral, e devem ser conferidas antes de embasar decisões relevantes.
        </p>
        <p>
          Cada gabinete pode ter um limite mensal de uso. Atingido o limite, a assistente fica
          indisponível até o ciclo seguinte.
        </p>
      </Secao>

      <Secao titulo="6. Integração com o Google Agenda">
        <p>
          A conexão é opcional e depende de autorização expressa na tela de consentimento do Google.
          O acesso é <strong>somente leitura</strong>: o AdminHub importa os compromissos e nunca
          cria, altera ou exclui eventos na agenda de origem.
        </p>
        <p>
          A conexão pode ser encerrada a qualquer momento pelo botão <em>Desconectar</em>. O
          tratamento desses dados está descrito na{' '}
          <Link href="/politica-de-privacidade" style={{ color: 'var(--brand-cobalt-text)' }}>
            Política de Privacidade
          </Link>.
        </p>
      </Secao>

      <Secao titulo="7. Uso adequado">
        <p>Ao usar a plataforma, você se compromete a não:</p>
        <Lista itens={[
          'Compartilhar credenciais ou permitir acesso de terceiros não autorizados.',
          'Tentar acessar dados de outro gabinete ou contornar os controles de permissão.',
          'Utilizar os dados para finalidade ilícita ou vedada pela legislação eleitoral.',
          'Automatizar extrações em massa que comprometam a estabilidade do serviço.',
          'Reproduzir ou redistribuir a plataforma sem autorização.',
        ]} />
      </Secao>

      <Secao titulo="8. Disponibilidade">
        <p>
          Trabalhamos para manter o serviço no ar, mas não garantimos funcionamento ininterrupto:
          pode haver manutenções, falhas de fornecedores ou indisponibilidade das fontes públicas
          consultadas. Sempre que possível, avisaremos com antecedência sobre paradas programadas.
        </p>
      </Secao>

      <Secao titulo="9. Limitação de responsabilidade">
        <p>
          A plataforma é uma ferramenta de apoio à gestão. Não respondemos por decisões tomadas com
          base nas informações apresentadas, nem por danos indiretos ou lucros cessantes decorrentes
          do uso ou da indisponibilidade do serviço.
        </p>
      </Secao>

      <Secao titulo="10. Encerramento">
        <p>
          O gabinete pode encerrar o uso a qualquer momento. Podemos suspender o acesso em caso de
          descumprimento destes termos. Encerrado o contrato, os dados seguem o prazo de exclusão
          previsto na Política de Privacidade.
        </p>
      </Secao>

      <Secao titulo="11. Alterações e foro">
        <p>
          Estes termos podem ser atualizados; mudanças relevantes serão comunicadas na plataforma.
          Aplica-se a legislação brasileira, eleito o foro da comarca de Brasília/DF para dirimir
          controvérsias.
        </p>
      </Secao>

      <Secao titulo="12. Contato">
        <p>
          <a href="mailto:contato@adminhub.com.br" style={{ color: 'var(--brand-cobalt-text)' }}>
            contato@adminhub.com.br
          </a>
        </p>
      </Secao>
    </PaginaLegal>
  );
}
