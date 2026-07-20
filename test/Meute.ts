import assert from "node:assert/strict";
import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const COTISATION = ethers.parseEther("0.01");

// Doit rester synchronisé avec les enums Solidity (Meute.sol).
const TypeProposition = { Admission: 0, Titularisation: 1, Exclusion: 2, Depense: 3 };
const ChoixVote = { Approuver: 0, Rejeter: 1, Ajourner: 2 };

async function deployMeuteFixture() {
  const [fondateur1, fondateur2, fondateur3, candidat, etranger] = await ethers.getSigners();
  const fondateurs = [fondateur1, fondateur2, fondateur3];

  const meute = await ethers.deployContract("Meute", [fondateurs.map((f) => f.address), COTISATION]);

  return { meute, fondateurs, candidat, etranger };
}

describe("Meute", function () {
  describe("déploiement", function () {
    it("revert si aucun fondateur", async function () {
      await expect(ethers.deployContract("Meute", [[], COTISATION])).to.be.revertedWithCustomError(
        await ethers.getContractFactory("Meute"),
        "AucunFondateur",
      );
    });

    it("revert si cotisation nulle", async function () {
      const [f1] = await ethers.getSigners();
      await expect(ethers.deployContract("Meute", [[f1.address], 0n])).to.be.revertedWithCustomError(
        await ethers.getContractFactory("Meute"),
        "MontantInvalide",
      );
    });

    it("mint une carte Loup pour chaque fondateur", async function () {
      const { meute, fondateurs } = await networkHelpers.loadFixture(deployMeuteFixture);

      assert.equal(await meute.loupsActifs(), BigInt(fondateurs.length));
      for (const f of fondateurs) {
        assert.equal(await meute.estDormant(f.address), false);
      }
    });
  });

  describe("candidater", function () {
    it("revert si la cotisation versée est incorrecte", async function () {
      const { meute, candidat } = await networkHelpers.loadFixture(deployMeuteFixture);

      await expect(
        meute.connect(candidat).candidater({ value: COTISATION - 1n }),
      ).to.be.revertedWithCustomError(meute, "CotisationIncorrecte");
    });

    it("revert si l'appelant est déjà membre", async function () {
      const { meute, fondateurs } = await networkHelpers.loadFixture(deployMeuteFixture);

      await expect(
        meute.connect(fondateurs[0]).candidater({ value: COTISATION }),
      ).to.be.revertedWithCustomError(meute, "DejaMembre");
    });

    it("ouvre une proposition d'admission ciblant le candidat", async function () {
      const { meute, candidat } = await networkHelpers.loadFixture(deployMeuteFixture);

      await expect(meute.connect(candidat).candidater({ value: COTISATION }))
        .to.emit(meute, "PropositionOuverte")
        .withArgs(0n, TypeProposition.Admission, candidat.address);

      const prop = await meute.proposition(0n);
      assert.equal(prop.typeProp, BigInt(TypeProposition.Admission));
      assert.equal(prop.cible, candidat.address);
      assert.equal(prop.executee, false);
      // Au moins un Loup actif au déploiement : le snapshot est figé dès l'ouverture.
      assert.equal(prop.snapshotFige, true);
      assert.equal(prop.snapshotActifs, 3n);
    });

    it("revert sur une seconde candidature simultanée de la même adresse", async function () {
      const { meute, candidat } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(candidat).candidater({ value: COTISATION });

      await expect(
        meute.connect(candidat).candidater({ value: COTISATION }),
      ).to.be.revertedWithCustomError(meute, "CandidatureDejaOuverte");
    });
  });

  describe("voter", function () {
    async function ouvrirCandidature() {
      const fixture = await networkHelpers.loadFixture(deployMeuteFixture);
      await fixture.meute.connect(fixture.candidat).candidater({ value: COTISATION });
      return { ...fixture, proposalId: 0n };
    }

    it("revert si la proposition n'existe pas", async function () {
      const { meute, fondateurs } = await ouvrirCandidature();

      await expect(
        meute.connect(fondateurs[0]).voter(999n, ChoixVote.Approuver),
      ).to.be.revertedWithCustomError(meute, "ProposalInconnue");
    });

    it("revert si le votant n'est pas Loup", async function () {
      const { meute, candidat, etranger, proposalId } = await ouvrirCandidature();

      await expect(
        meute.connect(candidat).voter(proposalId, ChoixVote.Approuver),
      ).to.be.revertedWithCustomError(meute, "PasLoup");
      await expect(
        meute.connect(etranger).voter(proposalId, ChoixVote.Approuver),
      ).to.be.revertedWithCustomError(meute, "PasLoup");
    });

    it("revert si le choix Ajourner est exprimé sur une admission", async function () {
      const { meute, fondateurs, proposalId } = await ouvrirCandidature();

      await expect(
        meute.connect(fondateurs[0]).voter(proposalId, ChoixVote.Ajourner),
      ).to.be.revertedWithCustomError(meute, "ChoixInvalide");
    });

    it("enregistre le vote d'un Loup et émet VoteExprime", async function () {
      const { meute, fondateurs, proposalId } = await ouvrirCandidature();

      await expect(meute.connect(fondateurs[0]).voter(proposalId, ChoixVote.Approuver))
        .to.emit(meute, "VoteExprime")
        .withArgs(proposalId, fondateurs[0].address);

      const prop = await meute.proposition(proposalId);
      assert.equal(prop.votesApprouver, 1n);
      assert.equal(prop.votesRejeter, 0n);
    });

    it("revert en cas de double vote", async function () {
      const { meute, fondateurs, proposalId } = await ouvrirCandidature();

      await meute.connect(fondateurs[0]).voter(proposalId, ChoixVote.Approuver);
      await expect(
        meute.connect(fondateurs[0]).voter(proposalId, ChoixVote.Rejeter),
      ).to.be.revertedWithCustomError(meute, "DejaVote");
    });

    it("revert après la clôture du vote (7 jours)", async function () {
      const { meute, fondateurs, proposalId } = await ouvrirCandidature();

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);

      await expect(
        meute.connect(fondateurs[0]).voter(proposalId, ChoixVote.Approuver),
      ).to.be.revertedWithCustomError(meute, "VoteFerme");
    });
  });

  describe("dormance et snapshot (§7.5)", function () {
    it("un Loup silencieux depuis un an devient dormant sans aucune transaction", async function () {
      const { meute, fondateurs } = await networkHelpers.loadFixture(deployMeuteFixture);

      await networkHelpers.time.increase(365 * 24 * 60 * 60 + 1);

      // Pure lecture, aucune transaction envoyée entre-temps : la dormance
      // est bien passive, constatée à la lecture (§7.5).
      assert.equal(await meute.estDormant(fondateurs[0].address), true);
      assert.equal(await meute.loupsActifs(), 0n);
    });

    it("voter réveille un Loup dormant et le recompte dans loupsActifs", async function () {
      const { meute, fondateurs, candidat } = await networkHelpers.loadFixture(deployMeuteFixture);

      await networkHelpers.time.increase(365 * 24 * 60 * 60 + 1);
      assert.equal(await meute.loupsActifs(), 0n);

      // La meute est totalement dormante : candidater() ouvre quand même la
      // proposition, mais laisse le snapshot en attente (cas limite §7.5).
      await meute.connect(candidat).candidater({ value: COTISATION });
      let prop = await meute.proposition(0n);
      assert.equal(prop.snapshotFige, false);
      assert.equal(prop.snapshotActifs, 0n);

      await expect(meute.connect(fondateurs[0]).voter(0n, ChoixVote.Approuver))
        .to.emit(meute, "MembreReveille")
        .withArgs(fondateurs[0].address);

      // Le premier votant s'est réveillé avant que le snapshot ne soit pris :
      // il est lui-même le dénominateur qu'il vient de reconstituer.
      prop = await meute.proposition(0n);
      assert.equal(prop.snapshotFige, true);
      assert.equal(prop.snapshotActifs, 1n);
      assert.equal(prop.votesApprouver, 1n);

      assert.equal(await meute.estDormant(fondateurs[0].address), false);
      assert.equal(await meute.loupsActifs(), 1n);
    });

    it("se réveiller après un snapshot déjà figé n'agrandit pas le dénominateur", async function () {
      const { meute, fondateurs, candidat } = await networkHelpers.loadFixture(deployMeuteFixture);
      const signers = await ethers.getSigners();
      const candidat2 = signers[5];
      const candidat3 = signers[6];

      // 300 jours passent sans qu'aucun fondateur ne vote.
      await networkHelpers.time.increase(300 * 24 * 60 * 60);

      // fondateurs[1] et [2] votent maintenant : leur horodatage est
      // rafraîchi à "aujourd'hui" (jour 300). fondateurs[0] reste silencieux.
      await meute.connect(candidat).candidater({ value: COTISATION });
      await meute.connect(fondateurs[1]).voter(0n, ChoixVote.Approuver);
      await meute.connect(fondateurs[2]).voter(0n, ChoixVote.Approuver);

      // 100 jours de plus : total 400 jours pour fondateurs[0] (dormant,
      // > 365j), seulement 100 jours pour [1] et [2] (actifs).
      await networkHelpers.time.increase(100 * 24 * 60 * 60);

      assert.equal(await meute.estDormant(fondateurs[0].address), true);
      assert.equal(await meute.estDormant(fondateurs[1].address), false);
      assert.equal(await meute.loupsActifs(), 2n);

      await meute.connect(candidat2).candidater({ value: COTISATION });
      const prop = await meute.proposition(1n);
      // Le snapshot à l'ouverture ignore déjà fondateurs[0] : il ne compte
      // que les 2 Loups actifs restants.
      assert.equal(prop.snapshotFige, true);
      assert.equal(prop.snapshotActifs, 2n);

      // fondateurs[0], dormant, se réveille en votant tardivement sur cette
      // même proposition : son vote compte au numérateur mais le
      // dénominateur déjà figé n'en tient pas compte.
      await meute.connect(fondateurs[0]).voter(1n, ChoixVote.Approuver);
      const propApres = await meute.proposition(1n);
      assert.equal(propApres.snapshotActifs, 2n);
      assert.equal(propApres.votesApprouver, 1n);
      assert.equal(await meute.loupsActifs(), 3n);

      // Vérification indépendante : une proposition ouverte maintenant (les
      // 3 fondateurs actifs) fige bien un snapshot à 3.
      await meute.connect(candidat3).candidater({ value: COTISATION });
      const propSuivante = await meute.proposition(2n);
      assert.equal(propSuivante.snapshotActifs, 3n);
    });
  });

  describe("executer — admission (§7.2)", function () {
    async function ouvrirCandidatureEtVoter(nbApprouver: number, nbRejeter: number) {
      const fixture = await networkHelpers.loadFixture(deployMeuteFixture);
      await fixture.meute.connect(fixture.candidat).candidater({ value: COTISATION });

      for (let i = 0; i < nbApprouver; i++) {
        await fixture.meute.connect(fixture.fondateurs[i]).voter(0n, ChoixVote.Approuver);
      }
      for (let i = nbApprouver; i < nbApprouver + nbRejeter; i++) {
        await fixture.meute.connect(fixture.fondateurs[i]).voter(0n, ChoixVote.Rejeter);
      }

      return { ...fixture, proposalId: 0n };
    }

    it("revert si la proposition n'existe pas", async function () {
      const { meute } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(meute.executer(999n)).to.be.revertedWithCustomError(meute, "ProposalInconnue");
    });

    it("revert si le vote est encore ouvert", async function () {
      const { meute, proposalId } = await ouvrirCandidatureEtVoter(2, 0);
      await expect(meute.executer(proposalId)).to.be.revertedWithCustomError(meute, "VoteEncoreOuvert");
    });

    it("revert en cas de double exécution", async function () {
      const { meute, proposalId } = await ouvrirCandidatureEtVoter(2, 0);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);

      await meute.executer(proposalId);
      await expect(meute.executer(proposalId)).to.be.revertedWithCustomError(meute, "DejaExecutee");
    });

    it("2 voix pour sur 3 : mint une carte Louveteau et émet PropositionExecutee", async function () {
      const { meute, candidat, proposalId } = await ouvrirCandidatureEtVoter(2, 0);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);

      await expect(meute.executer(proposalId)).to.emit(meute, "PropositionExecutee").withArgs(proposalId);

      const c = await meute.carte(candidat.address);
      assert.equal(c.rang, 0n); // Rang.Louveteau
      assert.equal(await meute.ownerOf(BigInt(candidat.address)), candidat.address);

      // Une nouvelle candidature depuis la même adresse doit maintenant
      // échouer : le candidat est devenu membre.
      await expect(
        meute.connect(candidat).candidater({ value: COTISATION }),
      ).to.be.revertedWithCustomError(meute, "DejaMembre");
    });

    it("1 voix pour sur 3 (minorité) : rembourse la cotisation, aucune carte mintée", async function () {
      const { meute, candidat, proposalId } = await ouvrirCandidatureEtVoter(1, 2);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);

      await expect(meute.executer(proposalId)).to.changeEtherBalance(ethers, candidat, COTISATION);

      const c = await meute.carte(candidat.address);
      assert.equal(c.derniereActivite, 0n); // aucune carte : struct par défaut

      // Le candidat refusé peut retenter sa chance.
      await meute.connect(candidat).candidater({ value: COTISATION });
    });

    it("aucun vote exprimé : rejetée par défaut (pas de quorum, pas de majorité)", async function () {
      const { meute, candidat, proposalId } = await ouvrirCandidatureEtVoter(0, 0);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);

      await expect(meute.executer(proposalId)).to.changeEtherBalance(ethers, candidat, COTISATION);
    });
  });

  describe("proposerExclusion (§7.4)", function () {
    it("revert si l'appelant n'est pas Loup", async function () {
      const { meute, candidat } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(
        meute.connect(candidat).proposerExclusion(candidat.address),
      ).to.be.revertedWithCustomError(meute, "PasLoup");
    });

    it("revert si la cible n'est pas membre", async function () {
      const { meute, fondateurs, etranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(
        meute.connect(fondateurs[0]).proposerExclusion(etranger.address),
      ).to.be.revertedWithCustomError(meute, "PasMembre");
    });

    it("ouvre une proposition d'exclusion ciblant le membre visé", async function () {
      const { meute, fondateurs } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(meute.connect(fondateurs[0]).proposerExclusion(fondateurs[1].address))
        .to.emit(meute, "PropositionOuverte")
        .withArgs(0n, TypeProposition.Exclusion, fondateurs[1].address);
    });

    it("bout en bout : exclusion votée à la majorité brûle la carte du membre visé", async function () {
      const { meute, fondateurs } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(fondateurs[0]).proposerExclusion(fondateurs[1].address);
      await meute.connect(fondateurs[0]).voter(0n, ChoixVote.Approuver);
      await meute.connect(fondateurs[2]).voter(0n, ChoixVote.Approuver);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.executer(0n);

      await expect(meute.ownerOf(BigInt(fondateurs[1].address))).to.revert(ethers);
      assert.equal(await meute.loupsActifs(), 2n);
    });

    it("bout en bout : exclusion rejetée ne change rien", async function () {
      const { meute, fondateurs } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(fondateurs[0]).proposerExclusion(fondateurs[1].address);
      await meute.connect(fondateurs[0]).voter(0n, ChoixVote.Rejeter);
      await meute.connect(fondateurs[2]).voter(0n, ChoixVote.Rejeter);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.executer(0n);

      assert.equal(await meute.ownerOf(BigInt(fondateurs[1].address)), fondateurs[1].address);
      assert.equal(await meute.loupsActifs(), 3n);
    });
  });

  describe("proposerDepense (§7.6)", function () {
    // Une candidature, même non résolue, verse déjà la cotisation au
    // contrat : suffit à alimenter la trésorerie pour ces tests.
    async function financerTresorerie() {
      const fixture = await networkHelpers.loadFixture(deployMeuteFixture);
      const bailleur = (await ethers.getSigners())[5];
      await fixture.meute.connect(bailleur).candidater({ value: COTISATION });
      return fixture;
    }

    it("revert si l'appelant n'est pas Loup", async function () {
      const { meute, candidat, etranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(
        meute.connect(candidat).proposerDepense(etranger.address, 1n, "test"),
      ).to.be.revertedWithCustomError(meute, "PasLoup");
    });

    it("revert si le montant est nul", async function () {
      const { meute, fondateurs, etranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(
        meute.connect(fondateurs[0]).proposerDepense(etranger.address, 0n, "test"),
      ).to.be.revertedWithCustomError(meute, "MontantInvalide");
    });

    it("ouvre une proposition de dépense avec le bénéficiaire, le montant et le motif", async function () {
      const { meute, fondateurs, etranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      const montant = ethers.parseEther("0.001");

      await expect(meute.connect(fondateurs[0]).proposerDepense(etranger.address, montant, "serveur de jeu"))
        .to.emit(meute, "PropositionOuverte")
        .withArgs(0n, TypeProposition.Depense, etranger.address);

      const prop = await meute.proposition(0n);
      assert.equal(prop.montant, montant);
      assert.equal(prop.motif, "serveur de jeu");
    });

    it("bout en bout : dépense approuvée transfère le montant au bénéficiaire", async function () {
      const { meute, fondateurs, etranger } = await financerTresorerie();
      const montant = COTISATION; // couvert par la trésorerie financée ci-dessus

      await meute.connect(fondateurs[0]).proposerDepense(etranger.address, montant, "serveur de jeu");
      await meute.connect(fondateurs[0]).voter(1n, ChoixVote.Approuver);
      await meute.connect(fondateurs[2]).voter(1n, ChoixVote.Approuver);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await expect(meute.executer(1n)).to.changeEtherBalance(ethers, etranger, montant);
    });

    it("bout en bout : dépense rejetée ne transfère rien", async function () {
      const { meute, fondateurs, etranger } = await financerTresorerie();
      const montant = COTISATION;

      await meute.connect(fondateurs[0]).proposerDepense(etranger.address, montant, "serveur de jeu");
      await meute.connect(fondateurs[0]).voter(1n, ChoixVote.Rejeter);
      await meute.connect(fondateurs[2]).voter(1n, ChoixVote.Rejeter);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await expect(meute.executer(1n)).to.changeEtherBalance(ethers, etranger, 0n);
    });

    it("revert à l'exécution si la trésorerie est insuffisante", async function () {
      const { meute, fondateurs, etranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      const montant = ethers.parseEther("1"); // rien dans la trésorerie, aucune candidature versée

      await meute.connect(fondateurs[0]).proposerDepense(etranger.address, montant, "trop cher");
      await meute.connect(fondateurs[0]).voter(0n, ChoixVote.Approuver);
      await meute.connect(fondateurs[2]).voter(0n, ChoixVote.Approuver);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await expect(meute.executer(0n)).to.be.revertedWithCustomError(meute, "FondsInsuffisants");
    });
  });

  describe("ouvrirTitularisation et son exécution (§7.3)", function () {
    async function admettreLouveteau() {
      const fixture = await networkHelpers.loadFixture(deployMeuteFixture);
      await fixture.meute.connect(fixture.candidat).candidater({ value: COTISATION });
      await fixture.meute.connect(fixture.fondateurs[0]).voter(0n, ChoixVote.Approuver);
      await fixture.meute.connect(fixture.fondateurs[1]).voter(0n, ChoixVote.Approuver);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await fixture.meute.executer(0n);
      return { ...fixture, louveteau: fixture.candidat };
    }

    it("revert si l'appelant n'est pas Loup", async function () {
      const { meute, louveteau } = await admettreLouveteau();
      await expect(
        meute.connect(louveteau).ouvrirTitularisation(louveteau.address),
      ).to.be.revertedWithCustomError(meute, "PasLoup");
    });

    it("revert si la cible n'est pas Louveteau", async function () {
      const { meute, fondateurs, etranger } = await admettreLouveteau();
      await expect(
        meute.connect(fondateurs[0]).ouvrirTitularisation(fondateurs[1].address),
      ).to.be.revertedWithCustomError(meute, "PasLouveteau");
      await expect(
        meute.connect(fondateurs[0]).ouvrirTitularisation(etranger.address),
      ).to.be.revertedWithCustomError(meute, "PasLouveteau");
    });

    it("revert si la probation n'est pas terminée", async function () {
      const { meute, fondateurs, louveteau } = await admettreLouveteau();
      await expect(
        meute.connect(fondateurs[0]).ouvrirTitularisation(louveteau.address),
      ).to.be.revertedWithCustomError(meute, "ProbationNonTerminee");
    });

    it("revert sur une seconde ouverture simultanée", async function () {
      const { meute, fondateurs, louveteau } = await admettreLouveteau();
      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);

      await meute.connect(fondateurs[0]).ouvrirTitularisation(louveteau.address);
      await expect(
        meute.connect(fondateurs[1]).ouvrirTitularisation(louveteau.address),
      ).to.be.revertedWithCustomError(meute, "TitularisationDejaOuverte");
    });

    it("bout en bout : titularisation approuvée passe le Louveteau Loup, même carte", async function () {
      const { meute, fondateurs, louveteau } = await admettreLouveteau();
      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);

      await meute.connect(fondateurs[0]).ouvrirTitularisation(louveteau.address);
      await meute.connect(fondateurs[0]).voter(1n, ChoixVote.Approuver);
      await meute.connect(fondateurs[1]).voter(1n, ChoixVote.Approuver);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.executer(1n);

      const c = await meute.carte(louveteau.address);
      assert.equal(c.rang, 1n); // Rang.Loup
      assert.equal(await meute.ownerOf(BigInt(louveteau.address)), louveteau.address);
      assert.equal(await meute.loupsActifs(), 4n); // 3 fondateurs + ce nouveau Loup

      // Peut retenter une candidature ultérieurement n'a pas de sens ici,
      // mais une nouvelle ouverture de titularisation doit être possible à nouveau.
      assert.equal(await meute.estDormant(louveteau.address), false);
    });

    it("bout en bout : titularisation refusée brûle la carte", async function () {
      const { meute, fondateurs, louveteau } = await admettreLouveteau();
      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);

      await meute.connect(fondateurs[0]).ouvrirTitularisation(louveteau.address);
      await meute.connect(fondateurs[0]).voter(1n, ChoixVote.Rejeter);
      await meute.connect(fondateurs[1]).voter(1n, ChoixVote.Rejeter);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.executer(1n);

      await expect(meute.ownerOf(BigInt(louveteau.address))).to.revert(ethers);
    });

    it("bout en bout : ajournement explicite prolonge la probation de 3 mois", async function () {
      const { meute, fondateurs, louveteau } = await admettreLouveteau();
      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);

      await meute.connect(fondateurs[0]).ouvrirTitularisation(louveteau.address);
      await meute.connect(fondateurs[0]).voter(1n, ChoixVote.Ajourner);
      await meute.connect(fondateurs[1]).voter(1n, ChoixVote.Ajourner);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.executer(1n);

      const c = await meute.carte(louveteau.address);
      assert.equal(c.rang, 0n); // toujours Louveteau
      assert.equal(c.ajournements, 1n);

      // Une nouvelle ouverture immédiate échoue : la probation repart pour 3 mois.
      await expect(
        meute.connect(fondateurs[0]).ouvrirTitularisation(louveteau.address),
      ).to.be.revertedWithCustomError(meute, "ProbationNonTerminee");
    });

    it("aucun vote exprimé : ajournement par défaut, sans que quiconque ait choisi Ajourner", async function () {
      const { meute, fondateurs, louveteau } = await admettreLouveteau();
      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);

      await meute.connect(fondateurs[0]).ouvrirTitularisation(louveteau.address);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.executer(1n);

      const c = await meute.carte(louveteau.address);
      assert.equal(c.rang, 0n);
      assert.equal(c.ajournements, 1n);
    });

    it("une fois AJOURNEMENTS_MAX atteint, Ajourner n'est plus un choix valide", async function () {
      const { meute, fondateurs, louveteau } = await admettreLouveteau();

      // Deux ajournements consécutifs, chacun après sa probation.
      for (let i = 0; i < 2; i++) {
        await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);
        const proposalId = BigInt(i + 1);
        await meute.connect(fondateurs[0]).ouvrirTitularisation(louveteau.address);
        await meute.connect(fondateurs[0]).voter(proposalId, ChoixVote.Ajourner);
        await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
        await meute.executer(proposalId);
      }

      const c = await meute.carte(louveteau.address);
      assert.equal(c.ajournements, 2n); // AJOURNEMENTS_MAX

      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);
      await meute.connect(fondateurs[0]).ouvrirTitularisation(louveteau.address);
      await expect(
        meute.connect(fondateurs[0]).voter(3n, ChoixVote.Ajourner),
      ).to.be.revertedWithCustomError(meute, "ChoixInvalide");

      // Le défaut passif (sans quorum) reste possible et ne déborde pas le compteur.
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.executer(3n);
      const cApres = await meute.carte(louveteau.address);
      assert.equal(cApres.ajournements, 2n); // saturé, pas 3
      assert.equal(cApres.rang, 0n); // toujours Louveteau, ni titularisé ni exclu
    });
  });

  describe("jeSuisLa (§7.5)", function () {
    it("revert si l'appelant n'est pas Loup", async function () {
      const { meute, candidat } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(meute.connect(candidat).jeSuisLa()).to.be.revertedWithCustomError(meute, "PasLoup");
    });

    it("réveille un Loup dormant sans passer par un vote", async function () {
      const { meute, fondateurs } = await networkHelpers.loadFixture(deployMeuteFixture);

      await networkHelpers.time.increase(365 * 24 * 60 * 60 + 1);
      assert.equal(await meute.loupsActifs(), 0n);

      await expect(meute.connect(fondateurs[0]).jeSuisLa())
        .to.emit(meute, "MembreReveille")
        .withArgs(fondateurs[0].address);

      assert.equal(await meute.estDormant(fondateurs[0].address), false);
      assert.equal(await meute.loupsActifs(), 1n);
    });
  });

  describe("demissionner (§7.4)", function () {
    it("revert si l'appelant n'est pas membre", async function () {
      const { meute, etranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(meute.connect(etranger).demissionner()).to.be.revertedWithCustomError(meute, "PasMembre");
    });

    it("brûle la carte d'un Loup et le retire du décompte des actifs", async function () {
      const { meute, fondateurs } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(fondateurs[0]).demissionner();

      await expect(meute.ownerOf(BigInt(fondateurs[0].address))).to.revert(ethers);
      assert.equal(await meute.loupsActifs(), 2n);
    });

    it("n'empêche pas l'exécution d'un vote d'exclusion visant un démissionnaire entre-temps", async function () {
      const { meute, fondateurs } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(fondateurs[0]).proposerExclusion(fondateurs[1].address);
      await meute.connect(fondateurs[1]).demissionner();

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      // Ne doit pas revert malgré la carte déjà brûlée.
      await meute.executer(0n);
      assert.equal(await meute.loupsActifs(), 2n);
    });

    it("n'empêche pas l'exécution d'un vote de titularisation visant un démissionnaire entre-temps", async function () {
      const fixture = await networkHelpers.loadFixture(deployMeuteFixture);
      const { meute, fondateurs, candidat } = fixture;

      await meute.connect(candidat).candidater({ value: COTISATION });
      await meute.connect(fondateurs[0]).voter(0n, ChoixVote.Approuver);
      await meute.connect(fondateurs[1]).voter(0n, ChoixVote.Approuver);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.executer(0n);

      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);
      await meute.connect(fondateurs[0]).ouvrirTitularisation(candidat.address);
      await meute.connect(candidat).demissionner();

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      // Ne doit pas revert malgré la carte déjà brûlée.
      await meute.executer(1n);
      await expect(meute.ownerOf(BigInt(candidat.address))).to.revert(ethers);
    });
  });

  describe("non-transférabilité (§6, C3)", function () {
    it("revert sur un transfert entre deux détenteurs", async function () {
      const { meute, fondateurs } = await networkHelpers.loadFixture(deployMeuteFixture);

      await expect(
        meute
          .connect(fondateurs[0])
          .transferFrom(fondateurs[0].address, fondateurs[1].address, BigInt(fondateurs[0].address)),
      ).to.be.revertedWithCustomError(meute, "TransfertInterdit");
    });

    it("le mint (candidature admise) et le burn (démission) restent autorisés", async function () {
      const { meute, fondateurs, candidat } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(candidat).candidater({ value: COTISATION });
      await meute.connect(fondateurs[0]).voter(0n, ChoixVote.Approuver);
      await meute.connect(fondateurs[1]).voter(0n, ChoixVote.Approuver);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.executer(0n); // mint

      assert.equal(await meute.ownerOf(BigInt(candidat.address)), candidat.address);

      await meute.connect(candidat).demissionner(); // burn
      await expect(meute.ownerOf(BigInt(candidat.address))).to.revert(ethers);
    });
  });
});
