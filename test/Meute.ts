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
});
